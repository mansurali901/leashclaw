# LeashClaw × AutoGen

Wraps AutoGen tool functions with LeashClaw enforcement. Works with both plain Python functions registered as tools (`FunctionTool`) and async tools.

## Install

```bash
pip install autogen-agentchat autogen-ext
# copy leashclaw_guardrail.py into your project
```

## Usage — decorator (simplest)

```python
from leashclaw_guardrail import guardrail_function

@guardrail_function(
    agent_slug="autogen-coder",
    api_key="agk_...",
    guardrail_url="http://localhost:8000/api/v1",
)
def run_shell(command: str) -> str:
    import subprocess
    return subprocess.check_output(command, shell=True, text=True)

# Register with AssistantAgent as normal
agent = AssistantAgent("coder", tools=[run_shell], model_client=...)
```

## Usage — FunctionTool wrapper

```python
from autogen_agentchat.tools import FunctionTool
from leashclaw_guardrail import guardrail_function_tool

safe_tool = guardrail_function_tool(
    FunctionTool(run_shell, description="Run a shell command"),
    agent_slug="autogen-coder",
    api_key="agk_...",
)
agent = AssistantAgent("coder", tools=[safe_tool], model_client=...)
```

## How it works

1. AutoGen calls the function → wrapper fires first
2. Function name + arguments are classified into `(action, resource_type, resource)`
3. `POST /api/v1/enforcement/evaluate` is called synchronously
4. **Allow** → original function executes, result returned to agent
5. **Deny** → `PermissionError` raised; AutoGen surfaces it as a tool error message

## Override classification

When auto-classification isn't accurate enough, pass explicit values:

```python
@guardrail_function(
    agent_slug="...",
    api_key="...",
    action="execute",
    resource_type="tool",
    resource="exec:custom_runner",
)
def custom_runner(script: str) -> str: ...
```

## Configuration

| Parameter       | Default                        | Description                            |
|-----------------|--------------------------------|----------------------------------------|
| `agent_slug`    | —                              | Agent slug registered in LeashClaw     |
| `api_key`       | —                              | `agk_...` key from LeashClaw           |
| `guardrail_url` | `http://localhost:8000/api/v1` | LeashClaw API base URL                 |
| `action`        | auto-classified                | Override action                        |
| `resource_type` | auto-classified                | Override resource type                 |
| `resource`      | auto-classified                | Override resource identifier           |
| `fail_open`     | `False`                        | Allow calls when engine unreachable    |
| `timeout`       | `3.0`                          | HTTP timeout in seconds                |
