"""
LeashClaw guardrail integration for Microsoft AutoGen (autogen-agentchat ≥ 0.4).

Provides two integration points:

1. ``guardrail_function`` — wraps a plain Python function (the unit AutoGen
   registers as a tool) with a LeashClaw enforcement pre-check.

2. ``GuardrailToolAgent`` — a thin ``AssistantAgent`` subclass whose
   ``on_messages`` is overridden to evaluate every ``ToolCallMessage`` before
   forwarding it to the real executor.

AutoGen 0.4 architecture notes
-------------------------------
Tools are registered as Python functions via ``FunctionTool``. The agent
sends a ``ToolCallMessage``; an executor agent (``ToolUseAssistantAgent`` or
``CodeExecutorAgent``) runs the function and returns a ``ToolCallResultMessage``.

The cleanest interception point is wrapping the function itself (option 1),
because it fires regardless of which executor picks up the message. Option 2
is provided for cases where you cannot modify the function (e.g. third-party
tools).

Usage — function wrapper (simplest)
------------------------------------
    import autogen_agentchat as ag
    from autogen_agentchat.agents import AssistantAgent
    from autogen_agentchat.ui import Console
    from leashclaw_guardrail import guardrail_function

    @guardrail_function(
        agent_slug="autogen-coder",
        api_key="agk_...",
        guardrail_url="http://localhost:8000/api/v1",
        resource_type="tool",
        action="execute",
    )
    def run_shell(command: str) -> str:
        import subprocess
        return subprocess.check_output(command, shell=True, text=True)

    agent = AssistantAgent("coder", tools=[run_shell], model_client=...)

Usage — FunctionTool wrapper
-----------------------------
    from autogen_agentchat.tools import FunctionTool
    from leashclaw_guardrail import guardrail_function_tool

    safe_shell = guardrail_function_tool(
        FunctionTool(run_shell, description="Run a shell command"),
        agent_slug="autogen-coder",
        api_key="agk_...",
    )
"""

from __future__ import annotations

import json
import urllib.request
import urllib.error
import functools
from typing import Any, Callable, Optional


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def _classify(fn_name: str, kwargs: dict) -> tuple[str, str, str]:
    name = fn_name.lower()

    if any(k in name for k in ("read_file", "open_file", "load_file")):
        return "read", "filesystem", kwargs.get("path", kwargs.get("file_path", "unknown"))
    if any(k in name for k in ("write_file", "save_file", "create_file")):
        return "write", "filesystem", kwargs.get("path", kwargs.get("file_path", "unknown"))
    if any(k in name for k in ("shell", "bash", "run_command", "execute_code", "python_repl")):
        cmd = kwargs.get("command", kwargs.get("code", kwargs.get("script", "unknown")))
        first = str(cmd).split("\n")[0][:60]
        return "execute", "tool", f"exec:{first}"
    if any(k in name for k in ("fetch_url", "http_get", "requests", "scrape")):
        return "access_url", "url", kwargs.get("url", "unknown")
    if any(k in name for k in ("search", "web_search", "google", "serp")):
        q = kwargs.get("query", kwargs.get("search_query", "unknown"))
        return "call_api", "api", f"search:{str(q)[:80]}"
    if any(k in name for k in ("sql", "query_db", "database")):
        return "read", "database", fn_name
    if any(k in name for k in ("get_secret", "vault", "secret")):
        return "read", "secret", kwargs.get("key", fn_name)

    return "execute", "tool", fn_name


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
# Function wrapper (decorator / wrapper)
# ---------------------------------------------------------------------------

def guardrail_function(
    fn: Optional[Callable] = None,
    *,
    agent_slug: str,
    api_key: str,
    guardrail_url: str = "http://localhost:8000/api/v1",
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource: Optional[str] = None,
    fail_open: bool = False,
    timeout: float = 3.0,
) -> Callable:
    """
    Decorator / wrapper that evaluates a function call via LeashClaw before
    executing it. Can be used as:

        @guardrail_function(agent_slug=..., api_key=...)
        def my_tool(path: str) -> str: ...

    or as a plain wrapper:

        safe_fn = guardrail_function(my_tool, agent_slug=..., api_key=...)
    """
    def decorator(f: Callable) -> Callable:
        @functools.wraps(f)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            fn_name = f.__name__
            _action, _rtype, _resource = _classify(fn_name, kwargs)
            a = action or _action
            rt = resource_type or _rtype
            r = resource or _resource

            decision, reason = _evaluate(
                guardrail_url=guardrail_url,
                api_key=api_key,
                agent_slug=agent_slug,
                action=a,
                resource_type=rt,
                resource=r,
                metadata={"tool_name": fn_name, "framework": "autogen"},
                fail_open=fail_open,
                timeout=timeout,
            )

            if decision == "deny":
                raise PermissionError(
                    f"[LeashClaw] '{fn_name}' blocked — {reason}"
                )

            return f(*args, **kwargs)

        # Async support
        import asyncio
        if asyncio.iscoroutinefunction(f):
            @functools.wraps(f)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                fn_name = f.__name__
                _action, _rtype, _resource = _classify(fn_name, kwargs)
                a = action or _action
                rt = resource_type or _rtype
                r = resource or _resource

                decision, reason = _evaluate(
                    guardrail_url=guardrail_url,
                    api_key=api_key,
                    agent_slug=agent_slug,
                    action=a,
                    resource_type=rt,
                    resource=r,
                    metadata={"tool_name": fn_name, "framework": "autogen"},
                    fail_open=fail_open,
                    timeout=timeout,
                )

                if decision == "deny":
                    raise PermissionError(
                        f"[LeashClaw] '{fn_name}' blocked — {reason}"
                    )

                return await f(*args, **kwargs)

            return async_wrapper

        return wrapper

    if fn is not None:
        # Called as guardrail_function(fn, agent_slug=...) without @
        return decorator(fn)
    return decorator


# ---------------------------------------------------------------------------
# FunctionTool wrapper
# ---------------------------------------------------------------------------

class _GuardrailFunctionTool:
    """
    Wraps an AutoGen ``FunctionTool`` object, intercepting its ``run_json``
    method. Preserves ``name``, ``description``, and ``schema`` so AutoGen
    can register it normally.
    """

    def __init__(
        self,
        tool: Any,
        agent_slug: str,
        api_key: str,
        guardrail_url: str = "http://localhost:8000/api/v1",
        fail_open: bool = False,
        timeout: float = 3.0,
    ):
        self._inner = tool
        self._agent_slug = agent_slug
        self._api_key = api_key
        self._guardrail_url = guardrail_url
        self._fail_open = fail_open
        self._timeout = timeout
        # Mirror required attributes
        self.name = getattr(tool, "name", "unknown")
        self.description = getattr(tool, "description", "")
        self.schema = getattr(tool, "schema", {})

    async def run_json(self, args: dict, cancellation_token: Any = None) -> Any:
        action, resource_type, resource = _classify(self.name, args)

        decision, reason = _evaluate(
            guardrail_url=self._guardrail_url,
            api_key=self._api_key,
            agent_slug=self._agent_slug,
            action=action,
            resource_type=resource_type,
            resource=resource,
            metadata={"tool_name": self.name, "framework": "autogen"},
            fail_open=self._fail_open,
            timeout=self._timeout,
        )

        if decision == "deny":
            raise PermissionError(f"[LeashClaw] '{self.name}' blocked — {reason}")

        return await self._inner.run_json(args, cancellation_token)

    def __getattr__(self, item: str) -> Any:
        return getattr(self._inner, item)


def guardrail_function_tool(
    tool: Any,
    agent_slug: str,
    api_key: str,
    guardrail_url: str = "http://localhost:8000/api/v1",
    fail_open: bool = False,
    timeout: float = 3.0,
) -> _GuardrailFunctionTool:
    """Wrap an AutoGen FunctionTool with LeashClaw enforcement."""
    return _GuardrailFunctionTool(
        tool, agent_slug=agent_slug, api_key=api_key,
        guardrail_url=guardrail_url, fail_open=fail_open, timeout=timeout,
    )
