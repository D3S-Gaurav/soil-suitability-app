from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import json
import threading
from pydantic import BaseModel
import random

from sensor_reader import read_sensor_data, read_sensor_from_ip
from soil_engine import evaluate_soil, evaluate_all_crops
from dataset_loader import load_crop_data, list_all_crops

app = FastAPI(title="Soil Suitability API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Last successful sensor reading
latest_sensor_data = {"N": 0, "P": 0, "K": 0, "pH": 7.0, "moisture": 0}
is_simulating = False

def sensor_loop():
    """Background thread: continuously read sensor data from SERIAL, Wi-Fi, or simulation"""
    global latest_sensor_data, is_simulating
    from sensor_reader import read_sensor_data, read_sensor_from_ip
    import time
    
    while True:
        try:
            if connected_sensor_ip:
                # Polling Wi-Fi sensor
                data = read_sensor_from_ip(connected_sensor_ip)
                if data:
                    latest_sensor_data = data
                    is_simulating = False
                # Extremely high frequency polling (as requested, but with a tiny safety break)
                # 1ms is impossible for HTTP, so we use a minimal 100ms delay to prevent crashing the sensor.
                time.sleep(0.1) 
            else:
                # Falling back to Serial or Simulation
                reader = read_sensor_data()
                for data in reader:
                    if connected_sensor_ip: break # Exit if IP is suddenly set
                    latest_sensor_data = data
                    is_simulating = True
                    time.sleep(1) # Simulated data doesn't need to be 1ms
                    
        except Exception as e:
            print(f"Background sensor loop error: {e}")
            time.sleep(2) # Wait before retry on error

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
    # Store the IP immediately
    ip_to_test = config.ip.strip()
    if not ip_to_test:
        return {"status": "error", "message": "Invalid IP/URL provided."}
    
    connected_sensor_ip = ip_to_test
    print(f"Setting sensor IP to: {connected_sensor_ip}")
    
    # Test connection
    data = read_sensor_from_ip(connected_sensor_ip)
    if data:
        return {
            "status": "success", 
            "message": f"Successfully connected to sensor at {connected_sensor_ip}",
            "raw_data": data
        }
    return {
        "status": "error", 
        "message": f"Could not reach sensor at {connected_sensor_ip}. Verification failed."
    }

@app.get("/sensor/status")
def check_sensor_status():
    global connected_sensor_ip
    if not connected_sensor_ip:
        return {"status": "error", "message": "No sensor IP configured. Please connect first."}
    
    data = read_sensor_from_ip(connected_sensor_ip)
    if data:
        return {
            "status": "success", 
            "message": f"Sensor at {connected_sensor_ip} is ONLINE.",
            "raw_data": data
        }
    return {
        "status": "error", 
        "message": f"Sensor at {connected_sensor_ip} is OFFLINE or unreachable."
    }

@app.get("/connect_sensor")
def connect_sensor(ip: str = None):
    """Manual trigger to read and return a single sensor data payload"""
    try:
        global latest_sensor_data, connected_sensor_ip
        
        # If an IP is provided in the request, prioritize it and update the connection
        if ip:
            ip = ip.strip()
            print(f"Direct fetch request for IP: {ip}")
            connected_sensor_ip = ip
        
        if connected_sensor_ip:
            print(f"Attempting to read from: {connected_sensor_ip}")
            data = read_sensor_from_ip(connected_sensor_ip)
            if not data:
                # If we have an IP but it failed, we don't want to fallback to random data
                # as that confuses the user into thinking it's connected to 'something'
                raise Exception(f"Failed to read from Wi-Fi sensor at {connected_sensor_ip}")
        else:
            # ONLY fallback to serial simulation IF NO IP was ever configured
            print("No IP configured, falling back to serial/simulation...")
            from sensor_reader import read_sensor_data
            reader = read_sensor_data()
            data = next(reader)
            
        latest_sensor_data = data
        return {"success": True, "data": data}
    except Exception as e:
        print(f"Connect sensor error: {e}")
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": f"Connection Failed: {str(e)}"})

@app.get("/evaluate/{crop_name}")
def evaluate(crop_name: str):
    return evaluate_soil(latest_sensor_data, crop_name)

@app.get("/evaluate_all")
def evaluate_all():
    return {"suitable_crops": evaluate_all_crops(latest_sensor_data)}
