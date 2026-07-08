"""
Example: CrewAI research crew with LeashClaw guardrails.

Policies to configure in LeashClaw for this example:
- Allow SerperDevTool (call_api / api / search:*)
- Allow FileReadTool  (read / filesystem / /reports/**)
- Deny  FileWriteTool (write / filesystem / *) unless explicitly allowed
"""

from crewai import Agent, Crew, Task
from crewai_tools import FileReadTool, FileWriteTool, SerperDevTool

from leashclaw_guardrail import guardrail_tools

GUARDRAIL_URL = "http://localhost:8000/api/v1"
AGENT_SLUG    = "crewai-researcher"
AGENT_API_KEY = "agk_your_key_here"

safe_tools = guardrail_tools(
    [FileReadTool(), FileWriteTool(), SerperDevTool()],
    agent_slug=AGENT_SLUG,
    api_key=AGENT_API_KEY,
    guardrail_url=GUARDRAIL_URL,
    fail_open=False,
)

researcher = Agent(
    role="Research Analyst",
    goal="Research the topic thoroughly using approved sources",
    backstory="You are a careful analyst who only accesses approved resources.",
    tools=safe_tools,
    verbose=True,
)

task = Task(
    description="Research recent advances in LLM safety and summarize in /reports/llm_safety.txt",
    expected_output="A summary saved to /reports/llm_safety.txt",
    agent=researcher,
)

crew = Crew(agents=[researcher], tasks=[task], verbose=True)

if __name__ == "__main__":
    result = crew.kickoff()
    print(result)
