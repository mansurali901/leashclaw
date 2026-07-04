"""
The enforcement API. This is the integration surface external agent
runtimes (e.g. an OpenClaw/Hermes agent executor) call before performing
any tool call, file access, API call, or data-sharing action.

Two auth modes are supported on the same endpoint:
  - Agent service-to-service: `X-Agent-Api-Key` header (recommended for
    agent runtimes calling directly).
  - Human/dashboard JWT: for admins testing policies via the UI's
    "policy simulator".
"""
from fastapi import APIRouter, Depends, Header
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db.session import get_session
from app.modules.auth.deps import get_agent_from_api_key, require_auditor_or_above
from app.modules.enforcement.schemas import EvaluationRequest, EvaluationResponse
from app.modules.enforcement.service import evaluate_and_log

router = APIRouter(prefix="/enforcement", tags=["enforcement"])


@router.post("/evaluate", response_model=EvaluationResponse)
async def evaluate_action(
    payload: EvaluationRequest,
    session: AsyncSession = Depends(get_session),
    x_agent_api_key: str | None = Header(default=None, alias="X-Agent-Api-Key"),
):
    """
    Evaluate a single proposed agent action against all applicable
    guardrail rules. Returns allow/deny plus the matched rule and reason.
    Every call is logged as an AccessDecision (and, if denied or flagged,
    a Violation) regardless of the outcome.
    """
    if x_agent_api_key:
        # Validates the calling agent's key matches the agent_id it claims
        # to be, preventing one agent from evaluating actions "as" another.
        agent = await get_agent_from_api_key(x_agent_api_key, session)
        if agent.slug != payload.agent_id:
            payload = payload.model_copy(update={"agent_id": agent.slug})

    return await evaluate_and_log(session, payload)


@router.post("/simulate", response_model=EvaluationResponse)
async def simulate_action(
    payload: EvaluationRequest,
    session: AsyncSession = Depends(get_session),
    _user=Depends(require_auditor_or_above),
):
    """Dashboard policy simulator — evaluates without requiring an agent API key."""
    return await evaluate_and_log(session, payload)
