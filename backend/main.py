from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import json
import threading
import os
from dotenv import load_dotenv

load_dotenv()

from pydantic import BaseModel
import random

from sensor_reader import read_sensor_data, read_sensor_from_ip
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

class SensorConfig(BaseModel):
    ip: str

connected_sensor_ip = None

@app.post("/sensor/connect")
def connect_to_sensor_ip(config: SensorConfig):
    global connected_sensor_ip
    connected_sensor_ip = config.ip
    # Test connection
    data = read_sensor_from_ip(connected_sensor_ip)
    if data:
        return {"status": "success", "message": f"Successfully connected to sensor at {connected_sensor_ip}"}
    return {"status": "error", "message": f"Could not reach sensor at {connected_sensor_ip}"}

@app.get("/sensor/status")
def check_sensor_status():
    global connected_sensor_ip
    if not connected_sensor_ip:
        return {"status": "error", "message": "No sensor IP configured. Please connect first."}
    data = read_sensor_from_ip(connected_sensor_ip)
    if data:
        return {"status": "success", "message": f"Sensor at {connected_sensor_ip} is ONLINE."}
    return {"status": "error", "message": f"Sensor at {connected_sensor_ip} is OFFLINE."}

@app.get("/connect_sensor")
def connect_sensor():
    """Manual trigger to read and return a single sensor data payload"""
    try:
        global latest_sensor_data
        
        if connected_sensor_ip:
            data = read_sensor_from_ip(connected_sensor_ip)
            if not data:
                raise Exception("Failed to read from Wi-Fi sensor")
        else:
            # Fallback to serial simulation if no IP
            from sensor_reader import read_sensor_data
            reader = read_sensor_data()
            data = next(reader)
            
        latest_sensor_data = data
        return {"success": True, "data": data}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": f"Failed to fetch sensor data: {str(e)}"})

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

