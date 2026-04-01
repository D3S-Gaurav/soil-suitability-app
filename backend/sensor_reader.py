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
    Example sensor output: {"N": 85, "P": 42, "K": 43, "pH": 6.5, "moisture": 38}
    """
    try:
        url = f"http://{ip}/"
        response = requests.get(url, timeout=3)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error reading from IP {ip}: {e}")
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
        # FALLBACK: simulate data for testing
        while True:
            yield {
                "N": random.randint(0, 140),
                "P": random.randint(5, 145),
                "K": random.randint(5, 205),
                "pH": round(random.uniform(3.5, 9.5), 2),
                "moisture": random.randint(10, 70)
            }
            time.sleep(3)
