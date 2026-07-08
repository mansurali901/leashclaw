"""
LeashClaw guardrail integration for CrewAI.

Wraps CrewAI tools so every invocation is evaluated by the LeashClaw
enforcement engine before execution. Denied calls raise PermissionError,
which CrewAI surfaces to the agent as a tool error (the agent can then
decide to stop or try an alternative tool).

Usage
-----
    from leashclaw_guardrail import GuardrailToolWrapper, guardrail_tools

    # Wrap individual tools
    safe_tools = guardrail_tools(
        [FileReadTool(), SerperDevTool()],
        agent_slug="crewai-researcher",
        api_key="agk_...",
        guardrail_url="http://localhost:8000/api/v1",
    )

    researcher = Agent(
        role="Research Analyst",
        tools=safe_tools,
        ...
    )
"""

from __future__ import annotations

import re
import urllib.request
import urllib.error
import json
from typing import Any, Optional, Type
from functools import wraps

try:
    from crewai.tools import BaseTool
    from pydantic import BaseModel
except ImportError as e:
    raise ImportError("crewai is required: pip install crewai") from e


# ---------------------------------------------------------------------------
# Resource classification — maps CrewAI tool class names to the LeashClaw
# (action, resource_type, resource) taxonomy.
# ---------------------------------------------------------------------------

def _classify(tool_name: str, tool_input: Any) -> tuple[str, str, str]:
    """Return (action, resource_type, resource) for a tool call."""
    name = tool_name.lower().replace(" ", "_")

    # Filesystem tools
    if any(k in name for k in ("file_read", "read_file", "directory_read")):
        path = _extract(tool_input, ("path", "file_path", "directory_path"), "unknown")
        return "read", "filesystem", path
    if any(k in name for k in ("file_write", "write_file")):
        path = _extract(tool_input, ("path", "file_path"), "unknown")
        return "write", "filesystem", path
    if any(k in name for k in ("file_delete", "delete_file")):
        path = _extract(tool_input, ("path", "file_path"), "unknown")
        return "delete", "filesystem", path

    # Web / URL tools
    if any(k in name for k in ("browser", "scrape", "web_scraper", "fetch_url", "selenium")):
        url = _extract(tool_input, ("url", "website_url", "href"), "unknown")
        return "access_url", "url", url

    # Search / API tools
    if any(k in name for k in ("search", "serper", "serp", "tavily", "exa", "you_com")):
        query = _extract(tool_input, ("search_query", "query", "q"), "unknown")
        return "call_api", "api", f"search:{query[:80]}"

    # Code execution
    if any(k in name for k in ("code_interpreter", "python_repl", "shell", "bash", "exec")):
        cmd = _extract(tool_input, ("code", "command", "script"), "unknown")
        first = cmd.split("\n")[0][:60] if isinstance(cmd, str) else "unknown"
        return "execute", "tool", f"exec:{first}"

    # Database
    if any(k in name for k in ("sql", "database", "postgres", "mysql", "sqlite")):
        return "read", "database", tool_name

    # Secret / credential
    if any(k in name for k in ("secret", "vault", "credential", "password", "key")):
        return "read", "secret", tool_name

    # Generic fallback
    return "execute", "tool", tool_name


def _extract(tool_input: Any, keys: tuple[str, ...], default: str) -> str:
    if isinstance(tool_input, dict):
        for k in keys:
            if k in tool_input and tool_input[k]:
                return str(tool_input[k])
    if isinstance(tool_input, str):
        return tool_input[:200]
    return default


# ---------------------------------------------------------------------------
# Core evaluation call
# ---------------------------------------------------------------------------

def _evaluate(
    *,
    guardrail_url: str,
    api_key: str,
    agent_slug: str,
    action: str,
    resource_type: str,
    resource: str,
    metadata: dict,
    fail_open: bool,
    timeout: float,
) -> tuple[str, str]:
    """
    Call POST /enforcement/evaluate.
    Returns (decision, reason) — decision is "allow" or "deny".
    """
    payload = json.dumps({
        "agent_id": agent_slug,
        "action": action,
        "resource_type": resource_type,
        "resource": resource,
        "metadata": metadata,
    }).encode()

    url = guardrail_url.rstrip("/") + "/enforcement/evaluate"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "X-Agent-Api-Key": api_key},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
            return data.get("decision", "deny"), data.get("reason", "")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        if fail_open:
            return "allow", f"guardrail unreachable ({e.code}) — fail-open"
        return "deny", f"guardrail error {e.code}: {body[:120]}"
    except Exception as exc:
        if fail_open:
            return "allow", f"guardrail unreachable ({exc}) — fail-open"
        return "deny", f"guardrail unreachable — failing closed: {exc}"


# ---------------------------------------------------------------------------
# Wrapper class
# ---------------------------------------------------------------------------

class GuardrailToolWrapper(BaseTool):
    """
    Wraps any CrewAI BaseTool with a LeashClaw enforcement check.

    Every call to ``_run`` is evaluated before being forwarded to the
    underlying tool. Denied calls raise ``PermissionError``.
    """

    name: str = ""
    description: str = ""

    _inner: Any
    _guardrail_url: str
    _api_key: str
    _agent_slug: str
    _fail_open: bool
    _timeout: float

    def __init__(
        self,
        tool: BaseTool,
        agent_slug: str,
        api_key: str,
        guardrail_url: str = "http://localhost:8000/api/v1",
        fail_open: bool = False,
        timeout: float = 3.0,
    ):
        super().__init__(name=tool.name, description=tool.description)
        self._inner = tool
        self._guardrail_url = guardrail_url
        self._api_key = api_key
        self._agent_slug = agent_slug
        self._fail_open = fail_open
        self._timeout = timeout

    def _run(self, **kwargs: Any) -> Any:
        action, resource_type, resource = _classify(self._inner.name, kwargs)

        decision, reason = _evaluate(
            guardrail_url=self._guardrail_url,
            api_key=self._api_key,
            agent_slug=self._agent_slug,
            action=action,
            resource_type=resource_type,
            resource=resource,
            metadata={"tool_name": self._inner.name, "framework": "crewai"},
            fail_open=self._fail_open,
            timeout=self._timeout,
        )

        if decision == "deny":
            raise PermissionError(
                f"[LeashClaw] Tool '{self._inner.name}' blocked — {reason}"
            )

        return self._inner._run(**kwargs)


# ---------------------------------------------------------------------------
# Convenience helper
# ---------------------------------------------------------------------------

def guardrail_tools(
    tools: list[BaseTool],
    agent_slug: str,
    api_key: str,
    guardrail_url: str = "http://localhost:8000/api/v1",
    fail_open: bool = False,
    timeout: float = 3.0,
) -> list[GuardrailToolWrapper]:
    """Wrap a list of CrewAI tools with LeashClaw enforcement."""
    return [
        GuardrailToolWrapper(
            tool=t,
            agent_slug=agent_slug,
            api_key=api_key,
            guardrail_url=guardrail_url,
            fail_open=fail_open,
            timeout=timeout,
        )
        for t in tools
    ]
