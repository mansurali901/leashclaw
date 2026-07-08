"""
Example: AutoGen multi-agent team with LeashClaw guardrails.

The coder agent can call run_shell and read_file. Both are wrapped so the
LeashClaw engine evaluates them before execution. Denied calls raise
PermissionError, which AutoGen surfaces as a tool failure message.
"""

import asyncio
import subprocess

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_agentchat.ui import Console
from autogen_agentchat.conditions import TextMentionTermination
from autogen_ext.models.openai import OpenAIChatCompletionClient

from leashclaw_guardrail import guardrail_function

GUARDRAIL_URL = "http://localhost:8000/api/v1"
AGENT_SLUG    = "autogen-coder"
AGENT_API_KEY = "agk_your_key_here"

model_client = OpenAIChatCompletionClient(model="gpt-4o")

# ── Guarded tools ────────────────────────────────────────────────────────────

@guardrail_function(
    agent_slug=AGENT_SLUG,
    api_key=AGENT_API_KEY,
    guardrail_url=GUARDRAIL_URL,
)
def run_shell(command: str) -> str:
    """Run a shell command and return stdout."""
    return subprocess.check_output(command, shell=True, text=True, timeout=30)


@guardrail_function(
    agent_slug=AGENT_SLUG,
    api_key=AGENT_API_KEY,
    guardrail_url=GUARDRAIL_URL,
)
def read_file(path: str) -> str:
    """Read a file and return its contents."""
    with open(path) as f:
        return f.read()


# ── Agents ───────────────────────────────────────────────────────────────────

coder = AssistantAgent(
    "coder",
    model_client=model_client,
    tools=[run_shell, read_file],
    system_message=(
        "You are a coding assistant. Use run_shell for shell commands "
        "and read_file to read files. Respect all access restrictions."
    ),
)

reviewer = AssistantAgent(
    "reviewer",
    model_client=model_client,
    system_message=(
        "You review the coder's output and verify correctness. "
        "Say TERMINATE when the task is complete."
    ),
)

termination = TextMentionTermination("TERMINATE")
team = RoundRobinGroupChat([coder, reviewer], termination_condition=termination)

if __name__ == "__main__":
    asyncio.run(
        Console(
            team.run_stream(task="List the contents of /reports/ and read the latest file.")
        )
    )
