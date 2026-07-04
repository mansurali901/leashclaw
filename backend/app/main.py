"""
Agent Guardrail Engine — API entrypoint.

Enterprise security posture defaults:
  - Fail-closed policy evaluation (see core.config.POLICY_DEFAULT_EFFECT)
  - JWT auth for humans, per-agent hashed API keys for service callers
  - RBAC on every mutating and read endpoint
  - CORS restricted to configured origins only
  - No debug info leaked in error responses in non-development envs
"""
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.db.init_db import init_db
from app.modules.agents.router import router as agents_router
from app.modules.audit_logs.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.enforcement.router import router as enforcement_router
from app.modules.policies.router import router as policies_router
from app.modules.resources.router import router as resources_router
from app.modules.rules.router import router as rules_router
from app.modules.sandbox.router import router as sandbox_router
from app.modules.settings.router import router as settings_router

settings = get_settings()

logging.basicConfig(level=logging.INFO if not settings.DEBUG else logging.DEBUG)
logger = logging.getLogger("guardrail")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.ENV == "development":
        # Convenience for local dev only; production uses Alembic migrations.
        await init_db()
    logger.info("Agent Guardrail Engine started (env=%s, policy_default=%s)", settings.ENV, settings.POLICY_DEFAULT_EFFECT)
    yield
    logger.info("Agent Guardrail Engine shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Security and governance platform for AI agents: policy enforcement, sandboxing, and audit.",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.ENV != "production" else None,
    redoc_url="/api/redoc" if settings.ENV != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_process_time_and_request_id(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Process-Time-Ms"] = f"{duration_ms:.2f}"
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url)
    detail = str(exc) if settings.DEBUG else "Internal server error"
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": detail})


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": settings.APP_NAME, "env": settings.ENV}


api_prefix = settings.API_V1_PREFIX
app.include_router(auth_router, prefix=api_prefix)
app.include_router(agents_router, prefix=api_prefix)
app.include_router(policies_router, prefix=api_prefix)
app.include_router(rules_router, prefix=api_prefix)
app.include_router(resources_router, prefix=api_prefix)
app.include_router(sandbox_router, prefix=api_prefix)
app.include_router(enforcement_router, prefix=api_prefix)
app.include_router(audit_router, prefix=api_prefix)
app.include_router(dashboard_router, prefix=api_prefix)
app.include_router(settings_router, prefix=api_prefix)
