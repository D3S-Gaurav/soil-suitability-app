from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import json
import threading
from pydantic import BaseModel
import random
import os
from dotenv import load_dotenv
import google.generativeai as genai
from fastapi import UploadFile, File, Form
import pandas as pd
import io

load_dotenv()
try:
    genai.configure(api_key=os.environ.get("GOOGLE_API_KEY", ""))
    model = genai.GenerativeModel('gemini-1.5-pro')
except Exception as e:
    print(f"Gemini API Config Warning: {e}")


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
connected_sensor_ip = None

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
                else:
                    latest_sensor_data = {"status": "disconnected", "message": f"Wi-Fi sensor at {connected_sensor_ip} disconnected"}
                
                # Slower polling rate (2.0s) to prevent crashing the Wi-Fi microcontroller TCP stack
                time.sleep(2.0) 
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

@app.post("/sensor/disconnect")
def disconnect_sensor():
    """Disconnect from the current sensor and reset state"""
    global connected_sensor_ip, latest_sensor_data, is_simulating
    prev_ip = connected_sensor_ip
    connected_sensor_ip = None
    latest_sensor_data = {"N": 0, "P": 0, "K": 0, "pH": 7.0, "moisture": 0}
    is_simulating = False
    print(f"Sensor disconnected (was: {prev_ip})")
    return {
        "status": "disconnected",
        "message": f"Successfully disconnected from {prev_ip}" if prev_ip else "No sensor was connected."
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
                # Force an explicit disconnected state rather than a silent failure
                data = {"status": "disconnected", "message": f"Wi-Fi sensor at {connected_sensor_ip} disconnected"}
        else:
            # ONLY fallback to serial IF NO IP was ever configured
            print("No IP configured, reading from serial...")
            from sensor_reader import read_sensor_data
            reader = read_sensor_data()
            data = next(reader)
            
        latest_sensor_data = data
        if data and data.get("status") == "disconnected":
            # Pass the clean disconnection string back immediately as an error
            return {"error": data.get("message")}
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

from soil_ai import analyze_soil_data

@app.post("/api/analyze")
def analyze(sensor_data: dict):
    if not any(k in sensor_data for k in ["N", "nitrogen"]):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400, content={"error": "Missing required fields in payload"})
    try:
        analysis = analyze_soil_data(sensor_data)
        return {"success": True, "analysis": analysis}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": f"AI Analysis failed: {str(e)}"})

@app.post("/webhook/analyze-soil")
async def analyze_soil_webhook(
    crop_type: str = Form(...), 
    file: UploadFile = File(...)
):
    """
    Webhook endpoint: Receives a CSV file and crop type, 
    sends to Gemini, and returns the verdict instantly.
    """
    try:
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode('utf-8')))
        data_string = df.to_string()

        prompt = f"""
        You are an expert agronomist and soil scientist. Your task is to analyze the provided soil test data and crop information.

        Instructions:
        Read the provided CSV/spreadsheet data carefully. Look for NPK (Nitrogen, Phosphorus, Potassium) levels, pH balance, organic matter, and micronutrients.
        Compare the soil metrics against the optimal requirements for the specified target crop.
        Identify any critical deficiencies, toxicities, or pH imbalances.
        Provide a realistic, actionable remedy plan.

        Output format: > Do not use conversational filler (e.g., 'Here is your analysis'). Output a structured summary with the following headers:
        Status Overview: (1-2 sentences on overall soil health)
        Critical Issues: (Bullet points of what is wrong)
        Action Plan / Fertilizer Recommendation: (Exact steps to fix it, including fertilizer types or soil amendments)
        Expected Outcome: (What the farmer can expect if they follow the advice)

        Target Crop: {crop_type}
        
        Soil Data:
        {data_string}
        """

        response = model.generate_content(prompt)
        
        return {
            "status": "success",
            "crop": crop_type,
            "ai_verdict": response.text
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
