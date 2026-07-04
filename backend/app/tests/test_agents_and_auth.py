import pytest

pytestmark = pytest.mark.asyncio


async def test_login_success(client, admin_user):
    resp = await client.post("/api/v1/auth/login", json={"email": "admin@test.example.com", "password": "Password123!"})
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["user"]["email"] == "admin@test.example.com"


async def test_login_wrong_password(client, admin_user):
    resp = await client.post("/api/v1/auth/login", json={"email": "admin@test.example.com", "password": "wrong"})
    assert resp.status_code == 401


async def test_create_agent_requires_admin(client):
    resp = await client.post(
        "/api/v1/agents",
        json={"slug": "agent_test_001", "name": "Test Agent"},
    )
    assert resp.status_code == 401  # no token at all


async def test_create_agent_as_admin_returns_api_key_once(client, admin_token):
    resp = await client.post(
        "/api/v1/agents",
        json={"slug": "agent_test_001", "name": "Test Agent", "owner_team": "eng"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["slug"] == "agent_test_001"
    assert body["api_key"].startswith("agk_")


async def test_duplicate_agent_slug_conflict(client, admin_token):
    payload = {"slug": "agent_dup_001", "name": "Dup Agent"}
    r1 = await client.post("/api/v1/agents", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert r1.status_code == 201
    r2 = await client.post("/api/v1/agents", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 409


async def test_create_policy_and_rule_flow(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    policy_resp = await client.post("/api/v1/policies", json={"name": "flow-test-policy"}, headers=headers)
    assert policy_resp.status_code == 201
    policy_id = policy_resp.json()["id"]

    rule_resp = await client.post(
        "/api/v1/rules",
        json={
            "policy_id": policy_id,
            "name": "deny-secrets",
            "subject_type": "agent",
            "subject_value": "*",
            "action": "read",
            "resource_type": "secret",
            "resource_pattern": "*",
            "effect": "deny",
            "priority": 1000,
        },
        headers=headers,
    )
    assert rule_resp.status_code == 201
    assert rule_resp.json()["effect"] == "deny"
