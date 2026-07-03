"""
Seed data for local dev / demo environments.

Run with:  python -m app.db.seed

Creates:
  - a super_admin user (email/password printed to stdout, never hardcoded
    in source beyond the dev-only default here)
  - two sandbox profiles (restrictive default, permissive for trusted agents)
  - an example policy with rules mirroring the guardrail spec, including
    the exact example from the product brief (deny confidential filesystem
    access in production)
  - two example agents, one sales agent and one support/hermes-style agent
"""
import asyncio
import os

from sqlmodel import select

from app.core.security import generate_agent_api_key, hash_password
from app.db.init_db import init_db
from app.db.models import (
    ActionType,
    Agent,
    AgentPolicyLink,
    AgentStatus,
    Effect,
    Policy,
    Resource,
    ResourceType,
    Rule,
    SandboxProfile,
    SubjectType,
    User,
    UserRole,
)
from app.db.session import AsyncSessionLocal


async def seed() -> None:
    await init_db()
    async with AsyncSessionLocal() as session:
        # --- Admin user ---
        admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@guardrail.example.com")
        admin_password = os.getenv("SEED_ADMIN_PASSWORD", "ChangeMe123!")
        existing = await session.exec(select(User).where(User.email == admin_email))
        admin = existing.first()
        if not admin:
            admin = User(
                email=admin_email,
                hashed_password=hash_password(admin_password),
                full_name="Platform Admin",
                role=UserRole.SUPER_ADMIN,
            )
            session.add(admin)
            await session.commit()
            await session.refresh(admin)
            print(f"[seed] Created admin user: {admin_email} / {admin_password} (CHANGE THIS PASSWORD)")
        else:
            print(f"[seed] Admin user already exists: {admin_email}")

        # --- Sandbox profiles ---
        restrictive = await _get_or_create_sandbox(
            session, "restrictive-default",
            description="Default sandbox for untrusted/new agents",
            cpu_limit_cores=0.5, memory_limit_mb=256, timeout_seconds=15,
            network_access=False, allowed_locations=["/data/sandbox"], max_concurrent_executions=1,
        )
        trusted = await _get_or_create_sandbox(
            session, "trusted-internal",
            description="For vetted internal automation agents",
            cpu_limit_cores=2.0, memory_limit_mb=2048, timeout_seconds=60,
            network_access=True, allowed_locations=["/data/internal", "/data/reports"], max_concurrent_executions=4,
        )

        # --- Example policy ---
        policy = await _get_or_create_policy(session, "baseline-data-governance", admin.id,
                                              description="Baseline guardrails for data classification and filesystem access")

        # Rule 1: exact example from the product brief
        await _get_or_create_rule(
            session,
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

        # Rule 2: allow public/internal filesystem reads for the same agent
        await _get_or_create_rule(
            session,
            policy_id=policy.id,
            name="allow-public-internal-filesystem",
            description="Allow reading public/internal classified files",
            subject_type=SubjectType.AGENT,
            subject_value="agent_sales_001",
            action=ActionType.READ,
            resource_type=ResourceType.FILESYSTEM,
            resource_pattern="/data/**",
            condition={"classification": {"in": ["public", "internal"]}},
            effect=Effect.ALLOW,
            priority=500,
        )

        # Rule 3: deny secrets access org-wide (wildcard subject)
        await _get_or_create_rule(
            session,
            policy_id=policy.id,
            name="deny-all-secret-classification",
            description="No agent may access resources classified as 'secret'",
            subject_type=SubjectType.AGENT,
            subject_value="*",
            action=ActionType.READ,
            resource_type=ResourceType.FILESYSTEM,
            resource_pattern="*",
            condition={"classification": {"eq": "secret"}},
            effect=Effect.DENY,
            priority=1000,
            alert_on_match=True,
        )

        # Rule 4: allow calling the internal CRM API
        await _get_or_create_rule(
            session,
            policy_id=policy.id,
            name="allow-crm-api",
            description="Allow the sales agent to call the internal CRM API",
            subject_type=SubjectType.AGENT,
            subject_value="agent_sales_001",
            action=ActionType.CALL_API,
            resource_type=ResourceType.API,
            resource_pattern="POST /v1/crm/*",
            condition={},
            effect=Effect.ALLOW,
            priority=400,
            rate_limit_per_minute=30,
        )

        # Rule 5: deny sharing PII to external destinations
        await _get_or_create_rule(
            session,
            policy_id=policy.id,
            name="deny-share-pii-external",
            description="Agents may not share PII-classified data to external destinations",
            subject_type=SubjectType.AGENT,
            subject_value="*",
            action=ActionType.SHARE,
            resource_type=ResourceType.DATABASE,
            resource_pattern="*",
            condition={"classification": {"eq": "pii"}, "destination": {"ne": "internal"}},
            effect=Effect.DENY,
            priority=950,
            alert_on_match=True,
        )

        # Rule 6: deny access to any *.exfiltration-looking* external URL, allow known SaaS domains
        await _get_or_create_rule(
            session,
            policy_id=policy.id,
            name="allow-known-saas-domains",
            description="Allow outbound calls to approved SaaS domains only",
            subject_type=SubjectType.AGENT,
            subject_value="*",
            action=ActionType.ACCESS_URL,
            resource_type=ResourceType.URL,
            resource_pattern="*.salesforce.com",
            condition={},
            effect=Effect.ALLOW,
            priority=300,
        )

        # --- Example agents ---
        sales_agent = await _get_or_create_agent(
            session, slug="agent_sales_001", name="Sales Outreach Agent",
            description="Automates CRM lookups and outreach drafting for the sales team",
            owner_team="sales", sandbox_profile_id=restrictive.id, created_by=admin.id,
            tags=["sales", "crm"],
        )
        hermes_agent = await _get_or_create_agent(
            session, slug="agent_hermes_support_001", name="Hermes Support Agent (OpenClaw)",
            description="OpenClaw/Hermes-integrated customer support agent",
            owner_team="support", sandbox_profile_id=trusted.id, created_by=admin.id,
            tags=["support", "openclaw", "hermes"],
        )

        for agent in (sales_agent, hermes_agent):
            link_exists = await session.exec(
                select(AgentPolicyLink).where(
                    AgentPolicyLink.agent_id == agent[0].id, AgentPolicyLink.policy_id == policy.id
                )
            )
            if not link_exists.first():
                session.add(AgentPolicyLink(agent_id=agent[0].id, policy_id=policy.id))
        await session.commit()

        # --- Example resource catalog entries ---
        await _get_or_create_resource(session, ResourceType.FILESYSTEM, "/data/customers/export.csv", "confidential", "sales")
        await _get_or_create_resource(session, ResourceType.API, "POST /v1/crm/contacts", "internal", "sales")
        await _get_or_create_resource(session, ResourceType.SECRET, "vault/prod/db-password", "secret", "platform")

        print("[seed] Seed complete.")
        print(f"[seed] Sales agent API key: {sales_agent[1]}")
        print(f"[seed] Hermes agent API key: {hermes_agent[1]}")


async def _get_or_create_sandbox(session, name, **kwargs) -> SandboxProfile:
    existing = await session.exec(select(SandboxProfile).where(SandboxProfile.name == name))
    found = existing.first()
    if found:
        return found
    profile = SandboxProfile(name=name, **kwargs)
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile


async def _get_or_create_policy(session, name, created_by, description=None) -> Policy:
    existing = await session.exec(select(Policy).where(Policy.name == name))
    found = existing.first()
    if found:
        return found
    policy = Policy(name=name, description=description, created_by=created_by)
    session.add(policy)
    await session.commit()
    await session.refresh(policy)
    return policy


async def _get_or_create_rule(session, policy_id, name, **kwargs) -> Rule:
    existing = await session.exec(select(Rule).where(Rule.policy_id == policy_id, Rule.name == name))
    found = existing.first()
    if found:
        return found
    rule = Rule(policy_id=policy_id, name=name, **kwargs)
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


async def _get_or_create_agent(session, slug, **kwargs) -> tuple[Agent, str]:
    existing = await session.exec(select(Agent).where(Agent.slug == slug))
    found = existing.first()
    if found:
        return found, "(already existed — key not re-shown; use rotate-key endpoint)"
    raw_key, key_hash = generate_agent_api_key()
    agent = Agent(slug=slug, api_key_hash=key_hash, api_key_prefix=raw_key[:12], **kwargs)
    session.add(agent)
    await session.commit()
    await session.refresh(agent)
    return agent, raw_key


async def _get_or_create_resource(session, resource_type, identifier, classification, owner_team) -> Resource:
    existing = await session.exec(select(Resource).where(Resource.identifier == identifier))
    found = existing.first()
    if found:
        return found
    resource = Resource(
        resource_type=resource_type, identifier=identifier, classification=classification, owner_team=owner_team
    )
    session.add(resource)
    await session.commit()
    await session.refresh(resource)
    return resource


if __name__ == "__main__":
    asyncio.run(seed())
