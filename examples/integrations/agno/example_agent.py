"""
Example: Agno agent with LeashClaw guardrails.

Option A — hook (guards all tools):
    Uses GuardrailHook in tool_call_hooks so no tool escapes evaluation.

Option B — per-tool wrapper:
    Wrap only specific tools you want guarded.
"""

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.tools.file import FileTools
from agno.tools.duckduckgo import DuckDuckGoTools

from leashclaw_guardrail import GuardrailHook, guardrail_tools

GUARDRAIL_URL = "http://localhost:8000/api/v1"
AGENT_SLUG    = "agno-assistant"
AGENT_API_KEY = "agk_your_key_here"

# ---------------------------------------------------------------------------
# Option A: hook applied to all tools
# ---------------------------------------------------------------------------
agent_with_hook = Agent(
    model=OpenAIChat(id="gpt-4o"),
    tools=[FileTools(), DuckDuckGoTools()],
    tool_call_hooks=[
        GuardrailHook(
            agent_slug=AGENT_SLUG,
            api_key=AGENT_API_KEY,
            guardrail_url=GUARDRAIL_URL,
            fail_open=False,
        )
    ],
    instructions=["Only access files in /reports/. Do not access external URLs."],
    markdown=True,
)

# ---------------------------------------------------------------------------
# Option B: wrap individual tools
# ---------------------------------------------------------------------------
safe_tools = guardrail_tools(
    [FileTools(), DuckDuckGoTools()],
    agent_slug=AGENT_SLUG,
    api_key=AGENT_API_KEY,
    guardrail_url=GUARDRAIL_URL,
)

agent_with_wrapped_tools = Agent(
    model=OpenAIChat(id="gpt-4o"),
    tools=safe_tools,
    markdown=True,
)

if __name__ == "__main__":
    agent_with_hook.print_response(
        "Read /reports/summary.txt and search for any recent news about it.",
        stream=True,
    )
