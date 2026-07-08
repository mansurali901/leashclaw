"""
LeashClaw guardrail integration for LangChain and LangGraph.

Provides a ``LeashClawCallbackHandler`` (subclass of BaseCallbackHandler) that
intercepts ``on_tool_start`` events and calls the LeashClaw enforcement engine.
Denied actions raise ``PermissionError``, which LangChain/LangGraph surfaces
as a tool error the agent can handle.

Also provides ``guardrail_tool`` — a decorator / wrapper for individual
LangChain ``BaseTool`` subclasses that prefer a non-callback approach.

Usage — callback handler (recommended, covers all tools)
--------------------------------------------------------
    from langchain.agents import AgentExecutor, create_openai_tools_agent
    from leashclaw_guardrail import LeashClawCallbackHandler

    guardrail = LeashClawCallbackHandler(
        agent_slug="lc-researcher",
        api_key="agk_...",
        guardrail_url="http://localhost:8000/api/v1",
    )

    agent_executor = AgentExecutor(
        agent=agent,
        tools=tools,
        callbacks=[guardrail],
    )

Usage — LangGraph node
----------------------
    Pass the handler in config:

    config = {"callbacks": [guardrail]}
    result = graph.invoke({"messages": [...]}, config=config)

Usage — per-tool wrapper
------------------------
    from langchain_community.tools import ShellTool
    from leashclaw_guardrail import guardrail_tool

    safe_shell = guardrail_tool(
        ShellTool(),
        agent_slug="lc-researcher",
        api_key="agk_...",
    )
"""

from __future__ import annotations

import json
import urllib.request
import urllib.error
from typing import Any, Optional, Union
from uuid import UUID

try:
    from langchain_core.callbacks.base import BaseCallbackHandler
    from langchain_core.tools import BaseTool
except ImportError as e:
    raise ImportError(
        "langchain-core is required: pip install langchain-core"
    ) from e


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def _classify(tool_name: str, tool_input: Union[str, dict]) -> tuple[str, str, str]:
    name = tool_name.lower().replace("-", "_").replace(" ", "_")

    # Normalise input to dict
    if isinstance(tool_input, str):
        args: dict = {"input": tool_input}
    else:
        args = tool_input or {}

    if any(k in name for k in ("read_file", "file_read", "read_document")):
        return "read", "filesystem", args.get("file_path", args.get("path", args.get("input", "unknown")))
    if any(k in name for k in ("write_file", "file_write")):
        return "write", "filesystem", args.get("file_path", args.get("path", "unknown"))
    if any(k in name for k in ("list_directory", "list_files", "directory")):
        return "list", "filesystem", args.get("path", args.get("dir_path", "unknown"))
    if any(k in name for k in ("bash", "shell", "terminal", "subprocess", "python_repl")):
        cmd = args.get("command", args.get("query", args.get("input", "unknown")))
        first = str(cmd).split("\n")[0][:60]
        return "execute", "tool", f"exec:{first}"
    if any(k in name for k in ("requests_get", "requests_post", "http", "fetch", "web_scrape", "browser")):
        url = args.get("url", args.get("input", "unknown"))
        return "access_url", "url", url
    if any(k in name for k in ("search", "ddg", "google", "bing", "serp", "tavily", "brave", "exa")):
        q = args.get("query", args.get("input", "unknown"))
        return "call_api", "api", f"search:{str(q)[:80]}"
    if any(k in name for k in ("sql_db", "query_sql", "database", "sql_query")):
        return "read", "database", tool_name
    if any(k in name for k in ("get_secret", "vault", "aws_secret")):
        return "read", "secret", args.get("secret_id", tool_name)

    return "execute", "tool", tool_name


# ---------------------------------------------------------------------------
# HTTP call
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
# Callback handler
# ---------------------------------------------------------------------------

class LeashClawCallbackHandler(BaseCallbackHandler):
    """
    LangChain callback handler that enforces LeashClaw policies on tool calls.

    Add to ``AgentExecutor(callbacks=[...])`` or pass in the LangGraph
    ``config={"callbacks": [...]}`` dict.
    """

    raise_error = True  # surface errors to the agent

    def __init__(
        self,
        agent_slug: str,
        api_key: str,
        guardrail_url: str = "http://localhost:8000/api/v1",
        fail_open: bool = False,
        timeout: float = 3.0,
    ):
        super().__init__()
        self._agent_slug = agent_slug
        self._api_key = api_key
        self._guardrail_url = guardrail_url
        self._fail_open = fail_open
        self._timeout = timeout

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
        inputs: Optional[dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None:
        tool_name: str = serialized.get("name", "unknown")
        tool_input: Union[str, dict] = inputs or input_str

        action, resource_type, resource = _classify(tool_name, tool_input)

        decision, reason = _evaluate(
            guardrail_url=self._guardrail_url,
            api_key=self._api_key,
            agent_slug=self._agent_slug,
            action=action,
            resource_type=resource_type,
            resource=resource,
            metadata={
                "tool_name": tool_name,
                "framework": "langchain",
                **(metadata or {}),
            },
            fail_open=self._fail_open,
            timeout=self._timeout,
        )

        if decision == "deny":
            raise PermissionError(
                f"[LeashClaw] Tool '{tool_name}' blocked — {reason}"
            )


# ---------------------------------------------------------------------------
# Per-tool wrapper
# ---------------------------------------------------------------------------

class _GuardrailTool(BaseTool):
    """Wraps a LangChain BaseTool with a LeashClaw pre-check."""

    name: str = ""
    description: str = ""

    _inner: BaseTool
    _handler: LeashClawCallbackHandler

    def __init__(self, tool: BaseTool, handler: LeashClawCallbackHandler):
        super().__init__(name=tool.name, description=tool.description)
        self._inner = tool
        self._handler = handler

    def _run(self, *args: Any, **kwargs: Any) -> Any:
        tool_input = kwargs or ({"input": args[0]} if args else {})
        self._handler.on_tool_start(
            {"name": self._inner.name},
            str(tool_input),
            run_id=UUID(int=0),
            inputs=tool_input,
        )
        return self._inner._run(*args, **kwargs)

    async def _arun(self, *args: Any, **kwargs: Any) -> Any:
        self._run(*args, **kwargs)  # sync guard, then async execution
        return await self._inner._arun(*args, **kwargs)


def guardrail_tool(
    tool: BaseTool,
    agent_slug: str,
    api_key: str,
    guardrail_url: str = "http://localhost:8000/api/v1",
    fail_open: bool = False,
    timeout: float = 3.0,
) -> _GuardrailTool:
    """Wrap a single LangChain tool with LeashClaw enforcement."""
    handler = LeashClawCallbackHandler(
        agent_slug=agent_slug,
        api_key=api_key,
        guardrail_url=guardrail_url,
        fail_open=fail_open,
        timeout=timeout,
    )
    return _GuardrailTool(tool, handler)


def guardrail_tools(
    tools: list[BaseTool],
    agent_slug: str,
    api_key: str,
    guardrail_url: str = "http://localhost:8000/api/v1",
    fail_open: bool = False,
    timeout: float = 3.0,
) -> list[_GuardrailTool]:
    """Wrap a list of LangChain tools with LeashClaw enforcement."""
    handler = LeashClawCallbackHandler(
        agent_slug=agent_slug,
        api_key=api_key,
        guardrail_url=guardrail_url,
        fail_open=fail_open,
        timeout=timeout,
    )
    return [_GuardrailTool(t, handler) for t in tools]
