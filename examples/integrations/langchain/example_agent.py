"""
Example: LangChain OpenAI tools agent + LangGraph with LeashClaw guardrails.
"""

# ── LangChain AgentExecutor ──────────────────────────────────────────────────
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_community.tools import ShellTool
from langchain_community.tools.file_management import ReadFileTool, WriteFileTool

from leashclaw_guardrail import LeashClawCallbackHandler

GUARDRAIL_URL = "http://localhost:8000/api/v1"
AGENT_SLUG    = "lc-researcher"
AGENT_API_KEY = "agk_your_key_here"

guardrail = LeashClawCallbackHandler(
    agent_slug=AGENT_SLUG,
    api_key=AGENT_API_KEY,
    guardrail_url=GUARDRAIL_URL,
    fail_open=False,
)

llm = ChatOpenAI(model="gpt-4o", temperature=0)
tools = [ReadFileTool(), WriteFileTool(), ShellTool()]

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant. Only access approved resources."),
    MessagesPlaceholder("chat_history", optional=True),
    ("human", "{input}"),
    MessagesPlaceholder("agent_scratchpad"),
])

agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    callbacks=[guardrail],   # <-- LeashClaw enforcement on every tool call
    verbose=True,
    handle_parsing_errors=True,
)


# ── LangGraph ────────────────────────────────────────────────────────────────
from langgraph.prebuilt import create_react_agent

graph = create_react_agent(llm, tools)

if __name__ == "__main__":
    # AgentExecutor style
    result = agent_executor.invoke({"input": "Read /reports/q1.txt and summarise."})
    print(result["output"])

    # LangGraph style — pass guardrail in config
    config = {"callbacks": [guardrail]}
    for event in graph.stream(
        {"messages": [("user", "Read /reports/q1.txt")]},
        config=config,
        stream_mode="values",
    ):
        if event.get("messages"):
            event["messages"][-1].pretty_print()
