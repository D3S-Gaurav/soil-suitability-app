from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import json
import threading
import os
from dotenv import load_dotenv

load_dotenv()

from sensor_reader import read_sensor_data
from soil_engine import evaluate_soil, evaluate_all_crops
from dataset_loader import load_crop_data, list_all_crops
from soil_ai import analyze_soil_data

app = FastAPI(title="Soil Suitability API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared latest sensor reading
latest_sensor_data = {"N": 0, "P": 0, "K": 0, "pH": 7.0, "moisture": 0}

def sensor_loop():
    """Background thread: continuously read sensor data"""
    global latest_sensor_data
    for data in read_sensor_data():
        latest_sensor_data = data

threading.Thread(target=sensor_loop, daemon=True).start()

@app.get("/crops")
def get_crops():
    df = load_crop_data()
    return {"crops": list_all_crops(df)}

@app.get("/sensor")
def get_sensor():
    return latest_sensor_data

@app.get("/connect_sensor")
def connect_sensor():
    """Manual trigger to read and return a single sensor data payload"""
    try:
        from sensor_reader import read_sensor_data
        reader = read_sensor_data()
        data = next(reader)
        # Update shared state as well
        global latest_sensor_data
        latest_sensor_data = data
        return {"success": True, "data": data}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": f"Failed to connect to sensor: {str(e)}"})

@app.get("/evaluate/{crop_name}")
def evaluate(crop_name: str):
    return evaluate_soil(latest_sensor_data, crop_name)

@app.get("/evaluate_all")
def evaluate_all():
    return {"suitable_crops": evaluate_all_crops(latest_sensor_data)}

@app.post("/api/analyze")
def analyze(sensor_data: dict):
    if not any(k in sensor_data for k in ["N", "nitrogen"]):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={"error": "Missing required NPK values"})
    try:
        analysis = analyze_soil_data(sensor_data)
        return {"success": True, "analysis": analysis}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": "Analysis failed: " + str(e)})

