# LeashClaw × LangChain / LangGraph

Integrates as a `BaseCallbackHandler` that fires on every `on_tool_start` event — no changes to your tools or agent required. Works with `AgentExecutor`, `create_react_agent`, and any LangGraph graph via the `config` dict.

## Install

```bash
pip install langchain-core langchain-openai langchain-community langgraph
# copy leashclaw_guardrail.py into your project
```

## Usage — callback handler (recommended)

```python
from leashclaw_guardrail import LeashClawCallbackHandler

guardrail = LeashClawCallbackHandler(
    agent_slug="lc-researcher",
    api_key="agk_...",
    guardrail_url="http://localhost:8000/api/v1",
    fail_open=False,
)

# AgentExecutor
agent_executor = AgentExecutor(agent=agent, tools=tools, callbacks=[guardrail])

# LangGraph
config = {"callbacks": [guardrail]}
graph.invoke({"messages": [...]}, config=config)
```

## Usage — per-tool wrapper

```python
from langchain_community.tools import ShellTool
from leashclaw_guardrail import guardrail_tool

safe_shell = guardrail_tool(ShellTool(), agent_slug="lc-researcher", api_key="agk_...")
agent_executor = AgentExecutor(agent=agent, tools=[safe_shell])
```

## How it works

1. LangChain fires `on_tool_start(serialized, input_str, ...)` before each tool
2. Tool name + input are classified into `(action, resource_type, resource)`
3. `POST /api/v1/enforcement/evaluate` is called with the agent's API key
4. **Deny** → `PermissionError` raised; LangChain surfaces it as a tool error
5. **Allow** → tool runs normally

## Tool → LeashClaw mapping

| LangChain tool            | action       | resource_type | resource             |
|---------------------------|--------------|---------------|----------------------|
| `ReadFileTool`            | `read`       | `filesystem`  | file path            |
| `WriteFileTool`           | `write`      | `filesystem`  | file path            |
| `ShellTool` / `BashTool`  | `execute`    | `tool`        | `exec:<command>`     |
| `requests_get`            | `access_url` | `url`         | URL                  |
| `TavilySearchResults`     | `call_api`   | `api`         | `search:<query>`     |
| `SQLDatabaseTool`         | `read`       | `database`    | tool name            |
| Other                     | `execute`    | `tool`        | tool name            |

## Configuration

| Parameter      | Default                        | Description                            |
|----------------|--------------------------------|----------------------------------------|
| `agent_slug`   | —                              | Agent slug registered in LeashClaw     |
| `api_key`      | —                              | `agk_...` key from LeashClaw           |
| `guardrail_url`| `http://localhost:8000/api/v1` | LeashClaw API base URL                 |
| `fail_open`    | `False`                        | Allow calls when engine unreachable    |
| `timeout`      | `3.0`                          | HTTP timeout in seconds                |
