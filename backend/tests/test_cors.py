"""Tests for the env-driven CORS allowlist.

This API drives local sensor hardware: it can be told which IP to connect to and
will return live readings. With `allow_origins=["*"]` any website the user
visited could issue those calls against their machine. The allowlist closes that.
"""

import importlib

import pytest

from app.main import DEFAULT_ALLOWED_ORIGINS, get_allowed_origins


def test_default_allows_only_local_dev_origins(monkeypatch):
    monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)

    origins = get_allowed_origins()

    assert origins == ["http://localhost:3000", "http://127.0.0.1:3000"]
    assert "*" not in origins


def test_wildcard_is_not_the_default():
    assert "*" not in DEFAULT_ALLOWED_ORIGINS


def test_env_var_overrides_the_default(monkeypatch):
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "https://agripulse.example.com")
    assert get_allowed_origins() == ["https://agripulse.example.com"]


def test_multiple_origins_are_split_on_commas(monkeypatch):
    monkeypatch.setenv(
        "CORS_ALLOW_ORIGINS",
        "https://a.example.com,https://b.example.com",
    )
    assert get_allowed_origins() == ["https://a.example.com", "https://b.example.com"]


def test_whitespace_and_empty_entries_are_stripped(monkeypatch):
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "  https://a.example.com , ,https://b.example.com,")
    assert get_allowed_origins() == ["https://a.example.com", "https://b.example.com"]


# --------------------------------------------------------------------------
# Behaviour through the middleware itself
# --------------------------------------------------------------------------

def test_allowed_origin_receives_cors_headers(client):
    response = client.get("/", headers={"Origin": "http://localhost:3000"})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_disallowed_origin_receives_no_cors_headers(client):
    """The request still succeeds server-side, but the browser will block the read."""
    response = client.get("/", headers={"Origin": "https://evil.example.com"})

    assert "access-control-allow-origin" not in response.headers


def test_preflight_from_disallowed_origin_is_rejected(client):
    response = client.options(
        "/sensor/connect",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert "access-control-allow-origin" not in response.headers


def test_preflight_from_allowed_origin_is_accepted(client):
    response = client.options(
        "/sensor/connect",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_app_is_not_registered_with_a_wildcard_origin():
    """Guard against a regression back to allow_origins=['*']."""
    from app.main import app

    cors = [m for m in app.user_middleware if "CORS" in str(m.cls)]
    assert cors, "CORS middleware is not installed"
    assert "*" not in cors[0].kwargs["allow_origins"]
