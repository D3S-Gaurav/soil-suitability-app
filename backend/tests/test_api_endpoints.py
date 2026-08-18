"""End-to-end tests for the FastAPI routes, driven through TestClient.

These cover the request/response contract the Next.js frontend depends on:
the health probe, the crop catalogue, crop evaluation against a stubbed sensor
reading, and the multipart CSV upload path with the LLM call stubbed out.
"""

import io

import pytest

from app.api.routers import analyze as analyze_router
from tests.conftest import BAD_READING, GOOD_RICE_READING


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------

def test_health_check_reports_ok(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "2.0"}


# --------------------------------------------------------------------------
# /crops
# --------------------------------------------------------------------------

def test_crops_returns_the_full_catalogue(client):
    response = client.get("/crops")
    assert response.status_code == 200

    crops = response.json()["crops"]
    # crop_data.csv holds 2,200 rows across 22 distinct crops.
    assert len(crops) == 22
    assert "rice" in crops
    assert "maize" in crops


def test_crops_are_sorted_and_unique(client):
    crops = client.get("/crops").json()["crops"]
    assert crops == sorted(crops)
    assert len(crops) == len(set(crops))


# --------------------------------------------------------------------------
# /evaluate/{crop}
# --------------------------------------------------------------------------

def test_evaluate_marks_in_band_reading_suitable(client, stub_sensor):
    stub_sensor(GOOD_RICE_READING)

    body = client.get("/evaluate/rice").json()

    assert body["crop"] == "rice"
    assert body["suitable"] is True
    assert body["issues"] == []
    assert "SUITABLE" in body["verdict"]


def test_evaluate_reports_issues_for_out_of_band_reading(client, stub_sensor):
    stub_sensor(BAD_READING)

    body = client.get("/evaluate/rice").json()

    assert body["suitable"] is False
    assert body["issues"], "an out-of-band reading must produce issues"
    # Every flagged nutrient should come with a remedy.
    assert body["suggestions"]


def test_evaluate_echoes_requirements_for_each_parameter(client, stub_sensor):
    stub_sensor(GOOD_RICE_READING)

    params = client.get("/evaluate/rice").json()["params"]

    assert set(params) == {"N", "P", "K", "pH"}
    for name, detail in params.items():
        assert detail["required_min"] <= detail["required_max"], name
        assert detail["status"] in {"optimal", "low", "high", "acidic", "alkaline"}


def test_evaluate_is_case_insensitive_on_crop_name(client, stub_sensor):
    stub_sensor(GOOD_RICE_READING)

    lower = client.get("/evaluate/rice").json()
    upper = client.get("/evaluate/RICE").json()

    assert lower["suitable"] == upper["suitable"]
    assert lower["params"] == upper["params"]


def test_evaluate_unknown_crop_returns_error_payload(client, stub_sensor):
    stub_sensor(GOOD_RICE_READING)

    body = client.get("/evaluate/definitely-not-a-crop").json()

    assert "error" in body
    assert "not found" in body["error"].lower()


# --------------------------------------------------------------------------
# /evaluate_all
# --------------------------------------------------------------------------

def test_evaluate_all_returns_only_crops_that_pass(client, stub_sensor):
    stub_sensor(GOOD_RICE_READING)

    suitable = client.get("/evaluate_all").json()["suitable_crops"]

    assert isinstance(suitable, list)
    assert suitable == sorted(suitable)
    # Anything /evaluate_all lists must independently pass /evaluate.
    for crop in suitable:
        assert client.get(f"/evaluate/{crop}").json()["suitable"] is True


def test_evaluate_all_is_empty_for_hostile_soil(client, stub_sensor):
    stub_sensor(BAD_READING)
    assert client.get("/evaluate_all").json()["suitable_crops"] == []


# --------------------------------------------------------------------------
# /sensor/*
# --------------------------------------------------------------------------

def test_sensor_root_returns_latest_reading(client, stub_sensor):
    stub_sensor(GOOD_RICE_READING)
    assert client.get("/sensor/").json() == GOOD_RICE_READING


def test_sensor_status_errors_when_nothing_connected(client):
    from app.services import sensor_service

    sensor_service.get_sensor_state()["connected_sensor_ip"] = None

    body = client.get("/sensor/status").json()
    assert body["status"] == "error"
    assert "connect" in body["message"].lower()


def test_sensor_connect_rejects_blank_ip(client):
    body = client.post("/sensor/connect", json={"ip": "   "}).json()
    assert body["status"] == "error"
    assert "invalid" in body["message"].lower()


def test_sensor_connect_requires_an_ip_field(client):
    # Pydantic should reject a payload with no `ip` at all.
    assert client.post("/sensor/connect", json={}).status_code == 422


# --------------------------------------------------------------------------
# /webhook/analyze-soil  (multipart CSV upload -> LLM report)
# --------------------------------------------------------------------------

CSV_BODY = "N,P,K,ph\n80,48,40,6.5\n82,50,41,6.6\n"


def _upload(client, csv_text=CSV_BODY, crop_type="rice"):
    return client.post(
        "/webhook/analyze-soil",
        data={"crop_type": crop_type},
        files={"file": ("soil.csv", io.BytesIO(csv_text.encode()), "text/csv")},
    )


def test_webhook_returns_the_model_verdict(client, stub_llm):
    stub_llm(analyze_router, attr="lm_client", reply="Status Overview: soil looks fine.")

    response = _upload(client)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["crop"] == "rice"
    assert body["ai_verdict"] == "Status Overview: soil looks fine."


def test_webhook_sends_the_csv_contents_to_the_model(client, stub_llm):
    fake = stub_llm(analyze_router, attr="lm_client", reply="ok")

    _upload(client)

    prompt = fake.last_prompt
    # The parsed CSV values must actually reach the prompt.
    assert "80" in prompt and "48" in prompt
    assert "Target Crop: rice" in prompt


def test_webhook_reports_error_when_model_is_unavailable(client, monkeypatch):
    monkeypatch.setattr(analyze_router, "lm_client", None)

    body = _upload(client).json()

    assert body["status"] == "error"
    assert "not initialized" in body["message"].lower()


def test_webhook_reports_error_on_unparseable_upload(client, stub_llm):
    stub_llm(analyze_router, attr="lm_client", reply="ok")

    # Not decodable as UTF-8 text, so pandas cannot parse it.
    response = client.post(
        "/webhook/analyze-soil",
        data={"crop_type": "rice"},
        files={"file": ("soil.csv", io.BytesIO(b"\xff\xfe\x00\x01"), "text/csv")},
    )

    assert response.json()["status"] == "error"


def test_webhook_requires_both_form_fields(client):
    # Missing the file part entirely.
    response = client.post("/webhook/analyze-soil", data={"crop_type": "rice"})
    assert response.status_code == 422


# --------------------------------------------------------------------------
# /api/analyze
# --------------------------------------------------------------------------

def test_api_analyze_rejects_payload_without_nitrogen(client):
    response = client.post("/api/analyze", json={"foo": "bar"})
    assert response.status_code == 400
    assert "Missing required fields" in response.json()["error"]


def test_api_analyze_returns_parsed_model_json(client, stub_llm):
    from app.services import ai_service

    stub_llm(ai_service)

    response = client.post("/api/analyze", json=GOOD_RICE_READING)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["analysis"]["grade"] == "Good"
    assert body["analysis"]["suitabilityScore"] == 82
