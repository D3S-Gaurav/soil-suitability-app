import serial
import json
import time
import random  # remove in production
import requests

SERIAL_PORT = "COM3"       # Windows: "COM3", Linux/Mac: "/dev/ttyUSB0"
BAUD_RATE = 9600

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
        # No fake fallback data: cleanly report disconnection
        while True:
            yield {"status": "disconnected", "message": f"Sensor on {SERIAL_PORT} disconnected"}
            time.sleep(3)
