import pytest

pytestmark = pytest.mark.asyncio


async def test_deny_confidential_filesystem_in_production(client, seeded_policy_agent):
    """Mirrors the exact example from the product brief."""
    payload = {
        "agent_id": "agent_sales_001",
        "user_id": "user_123",
        "action": "read",
        "resource_type": "filesystem",
        "resource": "/data/customers/export.csv",
        "metadata": {"classification": "confidential", "location": "production"},
    }
    resp = await client.post(
        "/api/v1/enforcement/evaluate",
        json=payload,
        headers={"X-Agent-Api-Key": seeded_policy_agent["raw_key"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision"] == "deny"
    assert "confidential" in body["reason"].lower()
    assert body["matched_rule_id"] is not None


async def test_allow_public_filesystem(client, seeded_policy_agent):
    payload = {
        "agent_id": "agent_sales_001",
        "action": "read",
        "resource_type": "filesystem",
        "resource": "/data/public/readme.csv",
        "metadata": {"classification": "public"},
    }
    resp = await client.post(
        "/api/v1/enforcement/evaluate",
        json=payload,
        headers={"X-Agent-Api-Key": seeded_policy_agent["raw_key"]},
    )
    assert resp.status_code == 200
    assert resp.json()["decision"] == "allow"


async def test_unknown_action_falls_back_to_default_deny(client, seeded_policy_agent):
    payload = {
        "agent_id": "agent_sales_001",
        "action": "execute",
        "resource_type": "tool",
        "resource": "some_unregistered_tool",
        "metadata": {},
    }
    resp = await client.post(
        "/api/v1/enforcement/evaluate",
        json=payload,
        headers={"X-Agent-Api-Key": seeded_policy_agent["raw_key"]},
    )
    assert resp.status_code == 200
    assert resp.json()["decision"] == "deny"


async def test_unknown_agent_is_denied(client):
    payload = {
        "agent_id": "agent_does_not_exist",
        "action": "read",
        "resource_type": "filesystem",
        "resource": "/data/x.csv",
        "metadata": {},
    }
    resp = await client.post("/api/v1/enforcement/evaluate", json=payload)
    assert resp.status_code == 200
    assert resp.json()["decision"] == "deny"


async def test_invalid_api_key_rejected(client, seeded_policy_agent):
    payload = {
        "agent_id": "agent_sales_001",
        "action": "read",
        "resource_type": "filesystem",
        "resource": "/data/x.csv",
        "metadata": {},
    }
    resp = await client.post(
        "/api/v1/enforcement/evaluate", json=payload, headers={"X-Agent-Api-Key": "agk_invalid_key"}
    )
    assert resp.status_code == 401
