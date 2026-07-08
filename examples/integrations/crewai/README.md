# LeashClaw × CrewAI

Wraps any CrewAI `BaseTool` with a LeashClaw enforcement check. Every tool invocation is evaluated before execution; denied calls raise `PermissionError`, which CrewAI surfaces as a tool error.

## Install

```bash
pip install crewai crewai-tools
# copy leashclaw_guardrail.py into your project
```

## Quick start

```python
from crewai import Agent
from crewai_tools import FileReadTool, SerperDevTool
from leashclaw_guardrail import guardrail_tools

safe_tools = guardrail_tools(
    [FileReadTool(), SerperDevTool()],
    agent_slug="crewai-researcher",   # slug registered in LeashClaw
    api_key="agk_...",
    guardrail_url="http://localhost:8000/api/v1",
    fail_open=False,                  # block if engine is unreachable
)

researcher = Agent(role="Researcher", tools=safe_tools, ...)
```

## How it works

1. Agent calls a tool → `GuardrailToolWrapper._run()` intercepts
2. Tool name + arguments are mapped to LeashClaw's `(action, resource_type, resource)` taxonomy
3. `POST /api/v1/enforcement/evaluate` is called with the agent's API key
4. **Allow** → tool executes normally
5. **Deny** → `PermissionError` raised with the policy reason

## Tool → LeashClaw mapping

| CrewAI tool            | action      | resource_type | resource              |
|------------------------|-------------|---------------|-----------------------|
| `FileReadTool`         | `read`      | `filesystem`  | file path             |
| `FileWriteTool`        | `write`     | `filesystem`  | file path             |
| `SerperDevTool`        | `call_api`  | `api`         | `search:<query>`      |
| `ScrapeWebsiteTool`    | `access_url`| `url`         | URL                   |
| `CodeInterpreterTool`  | `execute`   | `tool`        | `exec:<first line>`   |
| Other                  | `execute`   | `tool`        | tool name             |

## Configuration options

| Parameter      | Default                           | Description                            |
|----------------|-----------------------------------|----------------------------------------|
| `agent_slug`   | —                                 | Agent slug from LeashClaw              |
| `api_key`      | —                                 | `agk_...` key from LeashClaw           |
| `guardrail_url`| `http://localhost:8000/api/v1`    | LeashClaw API base URL                 |
| `fail_open`    | `False`                           | Allow calls when engine is unreachable |
| `timeout`      | `3.0`                             | HTTP timeout in seconds                |
