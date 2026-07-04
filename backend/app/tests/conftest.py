import os

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENV", "development")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import SQLModel

from app.core.security import generate_agent_api_key, hash_password
from app.db.models import Agent, AgentPolicyLink, ActionType, Effect, Policy, ResourceType, Rule, SubjectType, User, UserRole
from app.db.session import get_session
from app.main import app

TEST_DB_URL = "sqlite+aiosqlite:///file:memdb_test?mode=memory&cache=shared&uri=true"


@pytest_asyncio.fixture
async def engine():
    test_engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield test_engine
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def session(engine):
    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as s:
        yield s


@pytest_asyncio.fixture
async def client(engine):
    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_session():
        async with session_factory() as s:
            yield s

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_user(session):
    user = User(
        email="admin@test.example.com",
        hashed_password=hash_password("Password123!"),
        full_name="Test Admin",
        role=UserRole.SUPER_ADMIN,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_token(client, admin_user):
    resp = await client.post("/api/v1/auth/login", json={"email": "admin@test.example.com", "password": "Password123!"})
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest_asyncio.fixture
async def seeded_policy_agent(session):
    """Creates an agent + policy + rule mirroring the product-brief example."""
    raw_key, key_hash = generate_agent_api_key()
    agent = Agent(
        slug="agent_sales_001",
        name="Sales Agent",
        api_key_hash=key_hash,
        api_key_prefix=raw_key[:12],
    )
    session.add(agent)
    await session.commit()
    await session.refresh(agent)

    policy = Policy(name="test-policy")
    session.add(policy)
    await session.commit()
    await session.refresh(policy)

    session.add(AgentPolicyLink(agent_id=agent.id, policy_id=policy.id))

    deny_rule = Rule(
        policy_id=policy.id,
        name="deny-confidential-filesystem-production",
        description="Agent is not allowed to access confidential filesystem resources in production",
        subject_type=SubjectType.AGENT,
        subject_value="agent_sales_001",
        action=ActionType.READ,
        resource_type=ResourceType.FILESYSTEM,
        resource_pattern="/data/**",
        condition={"classification": {"in": ["confidential", "pii", "secret"]}, "location": {"eq": "production"}},
        effect=Effect.DENY,
        priority=900,
    )
    allow_rule = Rule(
        policy_id=policy.id,
        name="allow-public-filesystem",
        subject_type=SubjectType.AGENT,
        subject_value="agent_sales_001",
        action=ActionType.READ,
        resource_type=ResourceType.FILESYSTEM,
        resource_pattern="/data/**",
        condition={"classification": {"eq": "public"}},
        effect=Effect.ALLOW,
        priority=500,
    )
    session.add(deny_rule)
    session.add(allow_rule)
    await session.commit()

    return {"agent": agent, "policy": policy, "raw_key": raw_key}
