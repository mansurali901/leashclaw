from app.modules.enforcement.matcher import condition_matches, resource_matches, subject_matches


def test_exact_match():
    assert resource_matches("/data/customers/export.csv", "/data/customers/export.csv")


def test_glob_wildcard():
    assert resource_matches("/data/customers/*", "/data/customers/export.csv")
    assert not resource_matches("/data/customers/*", "/data/other/export.csv")


def test_recursive_glob():
    assert resource_matches("/data/**", "/data/customers/nested/export.csv")


def test_domain_wildcard():
    assert resource_matches("*.internal.example.com", "api.internal.example.com")
    assert not resource_matches("*.internal.example.com", "api.external.example.com")


def test_regex_pattern():
    assert resource_matches(r"re:^/data/.*\.csv$", "/data/x/y.csv")
    assert not resource_matches(r"re:^/data/.*\.csv$", "/data/x/y.json")


def test_wildcard_star():
    assert resource_matches("*", "anything/at/all")


def test_condition_empty_always_matches():
    assert condition_matches({}, {"classification": "confidential"})


def test_condition_in_operator():
    condition = {"classification": {"in": ["confidential", "pii", "secret"]}}
    assert condition_matches(condition, {"classification": "confidential"})
    assert not condition_matches(condition, {"classification": "public"})


def test_condition_multiple_fields_and_semantics():
    condition = {"classification": {"in": ["confidential"]}, "location": {"eq": "production"}}
    assert condition_matches(condition, {"classification": "confidential", "location": "production"})
    assert not condition_matches(condition, {"classification": "confidential", "location": "staging"})


def test_condition_shorthand_equality():
    condition = {"location": "production"}
    assert condition_matches(condition, {"location": "production"})
    assert not condition_matches(condition, {"location": "staging"})


def test_subject_wildcard():
    assert subject_matches("agent", "*", "agent_x", None, None, None)


def test_subject_agent_match():
    assert subject_matches("agent", "agent_sales_001", "agent_sales_001", None, None, None)
    assert not subject_matches("agent", "agent_sales_001", "agent_support_002", None, None, None)


def test_subject_team_match():
    assert subject_matches("team", "sales", "agent_x", "sales", None, None)
    assert not subject_matches("team", "sales", "agent_x", "support", None, None)
