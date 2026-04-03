from fastapi import APIRouter
from pydantic import BaseModel
from ...services.sensor_service import get_sensor_state, set_sensor_state, read_sensor_from_ip, read_sensor_data

router = APIRouter(prefix="/sensor", tags=["sensor"])

class SensorConfig(BaseModel):
    ip: str

@router.get("/")
def get_sensor():
    state = get_sensor_state()
    return state.get("latest_data")

@router.post("/connect")
def connect_to_sensor_ip(config: SensorConfig):
    ip_to_test = config.ip.strip()
    if not ip_to_test:
        return {"status": "error", "message": "Invalid IP/URL provided."}
    
    set_sensor_state(connected_sensor_ip=ip_to_test)
    print(f"Setting sensor IP to: {ip_to_test}")
    
    data = read_sensor_from_ip(ip_to_test)
    if data:
        return {
            "status": "success", 
            "message": f"Successfully connected to sensor at {ip_to_test}",
            "raw_data": data
        }
    return {
        "status": "error", 
        "message": f"Could not reach sensor at {ip_to_test}. Verification failed."
    }

@router.post("/disconnect")
def disconnect_sensor():
    state = get_sensor_state()
    prev_ip = state.get("connected_sensor_ip")
    set_sensor_state(
        connected_sensor_ip=None,
        latest_data={"N": 0, "P": 0, "K": 0, "pH": 7.0, "moisture": 0},
        is_simulating=False
    )
    print(f"Sensor disconnected (was: {prev_ip})")
    return {
        "status": "disconnected",
        "message": f"Successfully disconnected from {prev_ip}" if prev_ip else "No sensor was connected."
    }

@router.get("/status")
def check_sensor_status():
    state = get_sensor_state()
    connected_ip = state.get("connected_sensor_ip")
    if not connected_ip:
        return {"status": "error", "message": "No sensor IP configured. Please connect first."}
    
    data = read_sensor_from_ip(connected_ip)
    if data:
        return {
            "status": "success", 
            "message": f"Sensor at {connected_ip} is ONLINE.",
            "raw_data": data
        }
    return {
        "status": "error", 
        "message": f"Sensor at {connected_ip} is OFFLINE or unreachable."
    }

@router.get("/manual_connect")
def manual_connect(ip: str = None):
    # Matches original /connect_sensor
    try:
        if ip:
            ip = ip.strip()
            set_sensor_state(connected_sensor_ip=ip)
            
        state = get_sensor_state()
        connected_ip = state.get("connected_sensor_ip")
        
        if connected_ip:
            data = read_sensor_from_ip(connected_ip)
            if not data:
                data = {"status": "disconnected", "message": f"Wi-Fi sensor at {connected_ip} disconnected"}
        else:
            reader = read_sensor_data()
            data = next(reader)
            
        set_sensor_state(latest_data=data)
        if data and data.get("status") == "disconnected":
            return {"error": data.get("message")}
        return {"success": True, "data": data}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": f"Connection Failed: {str(e)}"})
