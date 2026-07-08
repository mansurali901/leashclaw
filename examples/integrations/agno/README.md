# LeashClaw × Agno

Two integration styles — choose whichever fits your setup:

| Style | How | Best for |
|---|---|---|
| **Hook** | `GuardrailHook` in `Agent(tool_call_hooks=[...])` | Guard all tools on an agent |
| **Wrapper** | `guardrail_tool()` / `guardrail_tools()` | Guard specific tools only |

## Install

```bash
pip install agno
# copy leashclaw_guardrail.py into your project
```

## Hook usage

```python
from agno.agent import Agent
from leashclaw_guardrail import GuardrailHook

agent = Agent(
    tools=[...],
    tool_call_hooks=[
        GuardrailHook(
            agent_slug="agno-assistant",
            api_key="agk_...",
            guardrail_url="http://localhost:8000/api/v1",
            fail_open=False,
        )
    ],
)
```

## Wrapper usage

```python
from agno.tools.file import FileTools
from leashclaw_guardrail import guardrail_tools

safe = guardrail_tools(
    [FileTools()],
    agent_slug="agno-assistant",
    api_key="agk_...",
)
agent = Agent(tools=safe, ...)
```

## How it works

1. Before a tool runs, `GuardrailHook.__call__(tool_name, tool_args)` fires
2. Arguments are classified into LeashClaw's `(action, resource_type, resource)` taxonomy
3. `POST /api/v1/enforcement/evaluate` is called
4. **Deny** → `PermissionError` raised, tool execution stops
5. **Allow** → tool runs normally, result returned to agent

## Configuration

| Parameter      | Default                         | Description                            |
|----------------|---------------------------------|----------------------------------------|
| `agent_slug`   | —                               | Agent slug registered in LeashClaw     |
| `api_key`      | —                               | `agk_...` key from LeashClaw           |
| `guardrail_url`| `http://localhost:8000/api/v1`  | LeashClaw API base URL                 |
| `fail_open`    | `False`                         | Allow calls when engine is unreachable |
| `timeout`      | `3.0`                           | HTTP timeout in seconds                |
