from sqlmodel.ext.asyncio.session import AsyncSession

from app.modules.enforcement.engine import evaluate, persist_decision
from app.modules.enforcement.schemas import EvaluationRequest, EvaluationResponse


async def evaluate_and_log(session: AsyncSession, request: EvaluationRequest) -> EvaluationResponse:
    result = await evaluate(session, request)
    access_decision = await persist_decision(session, request, result)

    return EvaluationResponse(
        decision=result.decision,
        reason=result.reason,
        matched_rule_id=result.matched_rule_id,
        access_decision_id=access_decision.id,
        rate_limited=result.rate_limited,
        latency_ms=round(result.latency_ms, 3),
    )
