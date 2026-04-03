import threading
import time
from ..services.sensor_service import read_sensor_data, read_sensor_from_ip, get_sensor_state, set_sensor_state

def sensor_loop():
    """Background thread: continuously read sensor data from SERIAL, Wi-Fi, or simulation"""
    while True:
        try:
            state = get_sensor_state()
            connected_ip = state.get("connected_sensor_ip")
            if connected_ip:
                # Polling Wi-Fi sensor
                data = read_sensor_from_ip(connected_ip)
                if data:
                    set_sensor_state(latest_data=data, is_simulating=False)
                else:
                    set_sensor_state(
                        latest_data={"status": "disconnected", "message": f"Wi-Fi sensor at {connected_ip} disconnected"},
                        is_simulating=False
                    )
                time.sleep(2.0)
            else:
                # Falling back to Serial or Simulation
                reader = read_sensor_data()
                for data in reader:
                    inner_state = get_sensor_state()
                    if inner_state.get("connected_sensor_ip"): break 
                    set_sensor_state(latest_data=data, is_simulating=True)
                    time.sleep(1)
        except Exception as e:
            print(f"Background sensor loop error: {e}")
            time.sleep(2)

def start_workers():
    threading.Thread(target=sensor_loop, daemon=True).start()
