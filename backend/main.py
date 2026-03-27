from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import json
import threading

from sensor_reader import read_sensor_data
from soil_engine import evaluate_soil, evaluate_all_crops
from dataset_loader import load_crop_data, list_all_crops

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

@app.get("/evaluate/{crop_name}")
def evaluate(crop_name: str):
    return evaluate_soil(latest_sensor_data, crop_name)

@app.get("/evaluate_all")
def evaluate_all():
    return {"suitable_crops": evaluate_all_crops(latest_sensor_data)}
