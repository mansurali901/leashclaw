"""
LeashClaw guardrail integration for Agno.

Provides a ``GuardrailHook`` that plugs into Agno's tool hook system and a
``guardrail_tool`` wrapper for individual tools. Both call the LeashClaw
enforcement engine before every tool execution.

Usage — hook (applies to all tools on an agent)
-----------------------------------------------
    from agno.agent import Agent
    from leashclaw_guardrail import GuardrailHook

    agent = Agent(
        model=...,
        tools=[...],
        tool_call_hooks=[
            GuardrailHook(
                agent_slug="agno-assistant",
                api_key="agk_...",
                guardrail_url="http://localhost:8000/api/v1",
            )
        ],
    )

Usage — per-tool wrapper
------------------------
    from agno.tools.file import FileTools
    from leashclaw_guardrail import guardrail_tool

    safe_file = guardrail_tool(
        FileTools(),
        agent_slug="agno-assistant",
        api_key="agk_...",
    )
    agent = Agent(tools=[safe_file], ...)
"""

from __future__ import annotations

import json
import urllib.request
import urllib.error
from typing import Any, Callable, Optional


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def _classify(tool_name: str, args: dict) -> tuple[str, str, str]:
    name = tool_name.lower()

    if any(k in name for k in ("read_file", "get_file", "cat_file")):
        return "read", "filesystem", args.get("path", args.get("file_name", "unknown"))
    if any(k in name for k in ("write_file", "save_file", "create_file")):
        return "write", "filesystem", args.get("path", args.get("file_name", "unknown"))
    if any(k in name for k in ("delete_file", "remove_file")):
        return "delete", "filesystem", args.get("path", "unknown")
    if any(k in name for k in ("list_files", "list_dir")):
        return "list", "filesystem", args.get("path", args.get("directory", "unknown"))
    if any(k in name for k in ("http", "fetch", "request", "get_url", "scrape")):
        return "access_url", "url", args.get("url", args.get("endpoint", "unknown"))
    if any(k in name for k in ("search", "duckduck", "google", "serp", "tavily", "exa")):
        q = args.get("query", args.get("search_query", "unknown"))
        return "call_api", "api", f"search:{str(q)[:80]}"
    if any(k in name for k in ("run_python", "python_repl", "execute_code", "shell", "bash")):
        code = args.get("code", args.get("command", "unknown"))
        first = str(code).split("\n")[0][:60]
        return "execute", "tool", f"exec:{first}"
    if any(k in name for k in ("sql", "query_db", "run_query")):
        return "read", "database", tool_name
    if any(k in name for k in ("secret", "vault", "get_secret")):
        return "read", "secret", args.get("key", tool_name)

    return "execute", "tool", tool_name


# ---------------------------------------------------------------------------
# HTTP evaluation
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
    payload = json.dumps({
        "agent_id": agent_slug,
        "action": action,
        "resource_type": resource_type,
        "resource": resource,
        "metadata": metadata,
    }).encode()

    url = guardrail_url.rstrip("/") + "/enforcement/evaluate"
    req = urllib.request.Request(
        url, data=payload,
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
            return "allow", f"guardrail unreachable — fail-open"
        return "deny", f"guardrail unreachable — failing closed: {exc}"


# ---------------------------------------------------------------------------
# Hook (attaches to Agent.tool_call_hooks)
# ---------------------------------------------------------------------------

class GuardrailHook:
    """
    Agno tool hook that evaluates every tool call via LeashClaw before
    the tool executes. Drop into Agent(tool_call_hooks=[GuardrailHook(...)]).

    Agno calls hooks as ``hook(tool_name, tool_args) -> None | dict``.
    Returning a dict with ``{"block": True, "reason": "..."}`` stops the call
    (exact API depends on Agno version; see Agno docs for hook contract).
    """

    def __init__(
        self,
        agent_slug: str,
        api_key: str,
        guardrail_url: str = "http://localhost:8000/api/v1",
        fail_open: bool = False,
        timeout: float = 3.0,
    ):
        self._agent_slug = agent_slug
        self._api_key = api_key
        self._guardrail_url = guardrail_url
        self._fail_open = fail_open
        self._timeout = timeout

    def __call__(self, tool_name: str, tool_args: dict, **kwargs: Any) -> Any:
        action, resource_type, resource = _classify(tool_name, tool_args)

        decision, reason = _evaluate(
            guardrail_url=self._guardrail_url,
            api_key=self._api_key,
            agent_slug=self._agent_slug,
            action=action,
            resource_type=resource_type,
            resource=resource,
            metadata={"tool_name": tool_name, "framework": "agno"},
            fail_open=self._fail_open,
            timeout=self._timeout,
        )

        if decision == "deny":
            raise PermissionError(f"[LeashClaw] '{tool_name}' blocked — {reason}")

        return None  # allow execution to proceed


# ---------------------------------------------------------------------------
# Per-tool wrapper
# ---------------------------------------------------------------------------

class _GuardrailWrappedTool:
    """
    Wraps an Agno tool object, intercepting its ``run`` / ``__call__`` method.
    Preserves the original tool's ``name`` and ``description`` so Agno can
    still register it normally.
    """

    def __init__(self, inner: Any, hook: GuardrailHook):
        self._inner = inner
        self._hook = hook
        # Mirror metadata so Agno sees the same tool
        self.name = getattr(inner, "name", type(inner).__name__)
        self.description = getattr(inner, "description", "")
        self.functions = getattr(inner, "functions", None)

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        tool_args = kwargs or ({"arg": args[0]} if args else {})
        self._hook(self.name, tool_args)
        return self._inner(*args, **kwargs)

    def __getattr__(self, item: str) -> Any:
        return getattr(self._inner, item)


def guardrail_tool(
    tool: Any,
    agent_slug: str,
    api_key: str,
    guardrail_url: str = "http://localhost:8000/api/v1",
    fail_open: bool = False,
    timeout: float = 3.0,
) -> _GuardrailWrappedTool:
    """Wrap a single Agno tool with LeashClaw enforcement."""
    hook = GuardrailHook(
        agent_slug=agent_slug,
        api_key=api_key,
        guardrail_url=guardrail_url,
        fail_open=fail_open,
        timeout=timeout,
    )
    return _GuardrailWrappedTool(tool, hook)


def guardrail_tools(
    tools: list,
    agent_slug: str,
    api_key: str,
    guardrail_url: str = "http://localhost:8000/api/v1",
    fail_open: bool = False,
    timeout: float = 3.0,
) -> list:
    """Wrap a list of Agno tools with LeashClaw enforcement."""
    hook = GuardrailHook(
        agent_slug=agent_slug,
        api_key=api_key,
        guardrail_url=guardrail_url,
        fail_open=fail_open,
        timeout=timeout,
    )
    return [_GuardrailWrappedTool(t, hook) for t in tools]
