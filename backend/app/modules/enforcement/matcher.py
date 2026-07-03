"""
Pattern matching and condition evaluation primitives used by the policy
engine. Kept dependency-free (stdlib only) so the internal engine has zero
external coupling and can be swapped for an OPA/Rego backend later without
touching this contract.
"""
import fnmatch
import re
from typing import Any


def resource_matches(pattern: str, identifier: str) -> bool:
    """
    Supports:
      - exact match:            /data/customers/export.csv
      - glob wildcards:         /data/customers/*  , *.internal.example.com , POST /v1/payments/*
      - '**' as recursive glob: /data/**
      - regex, if wrapped in    re:^/data/.*\\.csv$
    """
    if pattern == "*":
        return True
    if pattern.startswith("re:"):
        try:
            return re.match(pattern[3:], identifier) is not None
        except re.error:
            return False

    # Normalize ** (recursive glob) -> translate to a permissive fnmatch pattern
    normalized = pattern.replace("**", "*")
    return fnmatch.fnmatch(identifier, normalized)


_OPERATORS = {
    "eq": lambda field, val: field == val,
    "ne": lambda field, val: field != val,
    "in": lambda field, val: field in val,
    "not_in": lambda field, val: field not in val,
    "gt": lambda field, val: field is not None and field > val,
    "gte": lambda field, val: field is not None and field >= val,
    "lt": lambda field, val: field is not None and field < val,
    "lte": lambda field, val: field is not None and field <= val,
    "contains": lambda field, val: field is not None and val in field,
}


def condition_matches(condition: dict[str, Any], metadata: dict[str, Any]) -> bool:
    """
    Evaluate a rule's condition DSL against request metadata. An empty
    condition always matches (i.e. the rule applies unconditionally).

    condition = {
        "classification": {"in": ["confidential", "pii", "secret"]},
        "location": {"eq": "production"}
    }
    """
    if not condition:
        return True

    for field_name, operator_spec in condition.items():
        field_value = metadata.get(field_name)
        if not isinstance(operator_spec, dict):
            # shorthand: {"field": value} means equality
            if field_value != operator_spec:
                return False
            continue

        for op_name, expected in operator_spec.items():
            op_fn = _OPERATORS.get(op_name)
            if op_fn is None:
                # unknown operator -> fail closed for this clause
                return False
            try:
                if not op_fn(field_value, expected):
                    return False
            except TypeError:
                return False

    return True


def subject_matches(subject_type: str, subject_value: str, agent_slug: str, agent_team: str | None,
                     user_id: str | None, user_role: str | None) -> bool:
    if subject_value == "*":
        return True
    if subject_type == "agent":
        return subject_value == agent_slug
    if subject_type == "team":
        return agent_team is not None and subject_value == agent_team
    if subject_type == "role":
        return user_role is not None and subject_value == user_role
    if subject_type == "user":
        return user_id is not None and subject_value == user_id
    return False
