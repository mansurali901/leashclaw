"""
Fixed-window rate limiter backed by Redis, used to enforce per-rule and
per-agent `rate_limit_per_minute` guardrails. Falls back to allowing the
request (fail-open) only for the rate-limit check itself if Redis is
unreachable, since a hard fail-closed on infra hiccups would take down all
agent traffic; the underlying allow/deny rule evaluation is unaffected and
always fail-closed.
"""
import time

import redis.asyncio as aioredis

from app.core.config import get_settings

settings = get_settings()
_redis_client: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


async def check_rate_limit(key: str, limit_per_minute: int) -> tuple[bool, int]:
    """
    Returns (within_limit, current_count) using a fixed 60s window keyed by
    the current minute epoch, e.g. `ratelimit:agent_sales_001:rule_001:28391733`.
    """
    if limit_per_minute <= 0:
        return True, 0

    window = int(time.time() // 60)
    redis_key = f"ratelimit:{key}:{window}"
    try:
        client = get_redis()
        count = await client.incr(redis_key)
        if count == 1:
            await client.expire(redis_key, 65)
        return count <= limit_per_minute, count
    except Exception:
        # fail-open on infra failure for the rate-limit dimension only
        return True, 0
