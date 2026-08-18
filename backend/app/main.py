import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routers
from app.api.routers import sensor, crops, analyze

# Import background workers
from app.ingestion.workers import start_workers

app = FastAPI(title="Soil Suitability API (V2.0 - Industrial Offline-First)")

# CORS allowlist.
#
# This API is reachable from the browser, so a wildcard origin would let any site
# on the internet drive a user's local sensor gateway (connect it to an attacker's
# IP, read live readings, trigger analyses). Origins are therefore read from the
# CORS_ALLOW_ORIGINS env var as a comma-separated list, defaulting to the local
# Next.js dev server so a fresh clone still works with no configuration.
DEFAULT_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"


def get_allowed_origins() -> list[str]:
    """Parse CORS_ALLOW_ORIGINS into a clean list of origins."""
    raw = os.environ.get("CORS_ALLOW_ORIGINS", DEFAULT_ALLOWED_ORIGINS)
    origins = [origin.strip() for origin in raw.split(",")]
    return [origin for origin in origins if origin]


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Include routers
app.include_router(sensor.router)
app.include_router(crops.router)
app.include_router(analyze.router)

@app.on_event("startup")
def startup_event():
    print("Starting background ingestion workers...")
    start_workers()

@app.get("/")
def health_check():
    return {"status": "ok", "version": "2.0"}
