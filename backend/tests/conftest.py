"""Shared pytest fixtures.

Every test here runs fully offline. Nothing in this suite opens a serial port,
polls a Wi-Fi sensor, or calls a language model -- the sensor state is set
directly and the LLM client is replaced with a recording stub.

Note that `TestClient(app)` is instantiated *without* the `with` block on
purpose: entering the context manager would fire FastAPI's startup event, which
spawns the background ingestion thread in `app.ingestion.workers`. That thread
loops forever generating simulated readings and would race the fixtures below.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import sensor_service


# Readings chosen to sit comfortably inside rice's requirements
# (N 60-99, P 35-60, K 35-45, pH 5.01-7.87), so /evaluate/rice passes.
GOOD_RICE_READING = {"N": 80, "P": 48, "K": 40, "pH": 6.5, "moisture": 45}

# Readings far outside every crop's band, so evaluation reliably fails.
BAD_READING = {"N": 0, "P": 0, "K": 0, "pH": 2.0, "moisture": 5}


@pytest.fixture
def client():
    """A TestClient that does not trigger the background sensor worker."""
    return TestClient(app)


@pytest.fixture(autouse=True)
def reset_sensor_state():
    """Restore the module-level sensor state after every test.

    `sensor_service` keeps a single module-level dict, so without this the
    reading one test installs would leak into the next.
    """
    original = dict(sensor_service.get_sensor_state())
    yield
    state = sensor_service.get_sensor_state()
    state.clear()
    state.update(original)


@pytest.fixture
def stub_sensor():
    """Install a fixed sensor reading, standing in for real hardware."""

    def _install(reading):
        sensor_service.set_sensor_state(latest_data=dict(reading))
        return reading

    return _install


class RecordingLLMClient:
    """Stand-in for the LM Studio (OpenAI-compatible) client.

    Records every request so tests can assert on exactly what text would have
    been sent to the model, and replays a canned response.
    """

    def __init__(self, reply: str):
        self._reply = reply
        self.calls = []
        # Mirror the `client.chat.completions.create(...)` call shape.
        self.chat = type("_Chat", (), {"completions": self})()

    def create(self, **kwargs):
        self.calls.append(kwargs)
        message = type("_Msg", (), {"content": self._reply})()
        choice = type("_Choice", (), {"message": message})()
        return type("_Resp", (), {"choices": [choice]})()

    @property
    def last_prompt(self) -> str:
        """The full text of the most recent request, system + user combined."""
        assert self.calls, "the LLM client was never called"
        return "\n".join(m["content"] for m in self.calls[-1]["messages"])


VALID_ANALYSIS_JSON = json.dumps(
    {
        "suitabilityScore": 82,
        "grade": "Good",
        "recommendedCrops": [
            {"crop": "rice", "reason": "NPK in band", "expectedYield": "4 t/ha"}
        ],
        "nutrientAnalysis": {
            "nitrogen": "adequate",
            "phosphorus": "adequate",
            "potassium": "adequate",
        },
        "issuesDetected": [],
        "correctiveActions": [{"action": "maintain", "priority": "Low"}],
        "confidenceLevel": "High",
        "summary": "Soil is broadly suitable.",
    }
)


@pytest.fixture
def stub_llm(monkeypatch):
    """Replace the LLM client in a target module with a recording stub."""

    def _install(module, attr="client", reply=VALID_ANALYSIS_JSON):
        fake = RecordingLLMClient(reply)
        monkeypatch.setattr(module, attr, fake)
        return fake

    return _install
