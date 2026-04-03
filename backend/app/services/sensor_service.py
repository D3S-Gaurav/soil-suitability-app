import serial
import json
import time
import random  # remove in production
import requests

SERIAL_PORT = "COM3"       # Windows: "COM3", Linux/Mac: "/dev/ttyUSB0"
BAUD_RATE = 9600

# Global state for Sensor Service
_sensor_state = {
    "connected_sensor_ip": None,
    "latest_data": {"N": 0, "P": 0, "K": 0, "pH": 7.0, "moisture": 0},
    "is_simulating": False
}

def get_sensor_state():
    return _sensor_state

def set_sensor_state(latest_data=None, connected_sensor_ip=None, is_simulating=None):
    if latest_data is not None:
        _sensor_state["latest_data"] = latest_data
    if connected_sensor_ip is not None:
        _sensor_state["connected_sensor_ip"] = connected_sensor_ip
    if is_simulating is not None:
        _sensor_state["is_simulating"] = is_simulating

def read_sensor_from_ip(ip: str):
    """
    Fetches JSON data from the sensor over HTTP.
    Handles both raw IPs and full URLs.
    Example sensor output: {"N": 85, "P": 42, "K": 43, "pH": 6.5, "moisture": 38}
    """
    try:
        if ip.startswith("http://") or ip.startswith("https://"):
            url = ip
        else:
            url = f"http://{ip}/"
        
        print(f"Attempting to read from sensor URL: {url}")
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        data = response.json()
        print(f"Successfully received data: {data}")
        return data
    except Exception as e:
        print(f"Error reading from IP {ip} (URL: {url if 'url' in locals() else 'N/A'}): {e}")
        return None

def read_sensor_data():
    """
    Reads NPK, pH, moisture from Arduino over serial.
    Arduino should send a JSON string like:
    {"N": 85, "P": 42, "K": 43, "pH": 6.5, "moisture": 38}
    """
    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)
        time.sleep(2)  # wait for Arduino to initialize
        while True:
            line = ser.readline().decode("utf-8").strip()
            if line:
                data = json.loads(line)
                yield data
    except serial.SerialException as e:
        print(f"Serial error: {e}")
        # FALLBACK: simulate data for testing (includes light_lux & pressure_hpa for new UI cards)
        while True:
            yield {
                "N": random.randint(0, 140),
                "P": random.randint(5, 145),
                "K": random.randint(5, 205),
                "pH": round(random.uniform(3.5, 9.5), 2),
                "moisture": random.randint(10, 70),
                "light_lux": random.randint(0, 100000),
                "pressure_hpa": round(random.uniform(980.0, 1050.0), 1)
            }
            time.sleep(3)
