from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routers
from app.api.routers import sensor, crops, analyze

# Import background workers
from app.ingestion.workers import start_workers

app = FastAPI(title="Soil Suitability API (V2.0 - Industrial Offline-First)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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
