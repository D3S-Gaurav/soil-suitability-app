# 🌱 MASTER PROMPT: Real-Time Soil Suitability Website
## AI-Based Soil Characterization System — Full Build Guide

---

## PROJECT OVERVIEW

Build a **real-time full-stack web application** that:
1. Receives live soil sensor data (N, P, K, pH, moisture) via a Python backend
2. Accepts a target crop/plant from the user
3. Matches sensor readings against a Kaggle crop dataset
4. Outputs whether the soil is **suitable or not suitable** for that plant
5. If not suitable — gives **detailed, actionable remediation steps** using organic fertilizers

---

## TECH STACK

| Layer | Technology |
|---|---|
| Sensor Interface | Python (serial/UART or RS-485 for NPK sensor, Arduino) |
| Backend | Python — FastAPI |
| Real-time Communication | WebSockets (FastAPI WebSocket) |
| Dataset Matching | Pandas + Scikit-learn |
| Frontend | HTML + CSS + Vanilla JS (or React) |
| Database (optional logging) | SQLite via SQLAlchemy |

---

## STEP 1 — HARDWARE & SENSOR SETUP (Python)

### Sensors Used (from the paper):
- **NPK Sensor** — reads Nitrogen (N), Phosphorus (P), Potassium (K) via RS-485/UART
- **pH Sensor** — reads soil acidity/alkalinity
- **Soil Moisture Sensor** — reads water content
- **Arduino Uno** — acts as the central hub, relays data over USB serial

### Python Serial Reader (`sensor_reader.py`)

```python
import serial
import json
import time
import random  # remove in production

SERIAL_PORT = "COM3"       # Windows: "COM3", Linux/Mac: "/dev/ttyUSB0"
BAUD_RATE = 9600

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
```

> **Arduino side:** Program Arduino to read sensors every 3–5 seconds and print a JSON line to Serial:
> `Serial.println("{\"N\":85,\"P\":42,\"K\":43,\"pH\":6.5,\"moisture\":38}");`

---

## STEP 2 — DATASET SETUP (Kaggle)

### Dataset: [Crop Recommendation Dataset — Kaggle](https://www.kaggle.com/datasets/atharvaingle/crop-recommendation-dataset)

Columns: `N`, `P`, `K`, `temperature`, `humidity`, `ph`, `rainfall`, `label`

### `dataset_loader.py`

```python
import pandas as pd

DATASET_PATH = "crop_data.csv"

def load_crop_data():
    df = pd.read_csv(DATASET_PATH)
    return df

def get_crop_requirements(crop_name: str, df: pd.DataFrame) -> dict:
    """
    Returns min/max/mean ranges for N, P, K, pH for a given crop.
    """
    crop_df = df[df["label"].str.lower() == crop_name.lower()]
    if crop_df.empty:
        return None

    return {
        "crop": crop_name,
        "N":  {"min": crop_df["N"].min(),  "max": crop_df["N"].max(),  "mean": round(crop_df["N"].mean(), 1)},
        "P":  {"min": crop_df["P"].min(),  "max": crop_df["P"].max(),  "mean": round(crop_df["P"].mean(), 1)},
        "K":  {"min": crop_df["K"].min(),  "max": crop_df["K"].max(),  "mean": round(crop_df["K"].mean(), 1)},
        "pH": {"min": crop_df["ph"].min(), "max": crop_df["ph"].max(), "mean": round(crop_df["ph"].mean(), 2)},
    }

def list_all_crops(df: pd.DataFrame) -> list:
    return sorted(df["label"].unique().tolist())
```

---

## STEP 3 — SOIL SUITABILITY ENGINE (`soil_engine.py`)

```python
from dataset_loader import get_crop_requirements, load_crop_data

# Organic fertilizer lookup table (from the paper — Table I)
ORGANIC_FERTILIZERS = {
    "N_low":  ["Blood Meal (12% N)", "Feather Meal (12% N)", "Fish Emulsion (9% N)", "Fish Meal (10% N)", "Bat Guano (8% N)"],
    "N_high": ["Reduce nitrogen inputs", "Use Carbon-rich compost", "Plant cover crops like clover"],
    "P_low":  ["Bone Meal (20% P)", "Bat Guano (6% P)", "Rock Phosphate", "Fish Meal (5% P)"],
    "P_high": ["Avoid phosphorus fertilizers", "Plant phosphorus-absorbing crops", "Use sulfur to lower pH if needed"],
    "K_low":  ["Greensand (5% K)", "Seaweed (5% K)", "Wood Ash", "Granite Dust"],
    "K_high": ["Reduce potassium inputs", "Leach soil with deep watering", "Grow high-K consuming crops first"],
    "pH_low": ["Apply Agricultural Lime (Calcium Carbonate)", "Dolomite Lime", "Wood Ash"],
    "pH_high": ["Apply Elemental Sulfur", "Acidic compost (pine needles)", "Aluminum Sulfate"],
}

TOLERANCE = 0.10  # 10% tolerance buffer

def evaluate_soil(sensor_data: dict, crop_name: str) -> dict:
    df = load_crop_data()
    requirements = get_crop_requirements(crop_name, df)

    if not requirements:
        return {"error": f"Crop '{crop_name}' not found in dataset."}

    issues = []
    suggestions = []
    params = {}

    for param in ["N", "P", "K"]:
        val = sensor_data.get(param, 0)
        req = requirements[param]
        buffer = (req["max"] - req["min"]) * TOLERANCE

        status = "optimal"
        if val < req["min"] - buffer:
            status = "low"
            issues.append(f"{param} is too low ({val} vs min {req['min']})")
            suggestions.extend(ORGANIC_FERTILIZERS[f"{param}_low"])
        elif val > req["max"] + buffer:
            status = "high"
            issues.append(f"{param} is too high ({val} vs max {req['max']})")
            suggestions.extend(ORGANIC_FERTILIZERS[f"{param}_high"])

        params[param] = {
            "value": val,
            "required_min": req["min"],
            "required_max": req["max"],
            "required_mean": req["mean"],
            "status": status
        }

    # pH check
    ph_val = sensor_data.get("pH", 7.0)
    ph_req = requirements["pH"]
    ph_buffer = 0.3

    ph_status = "optimal"
    if ph_val < ph_req["min"] - ph_buffer:
        ph_status = "acidic"
        issues.append(f"pH too acidic ({ph_val} vs min {ph_req['min']})")
        suggestions.extend(ORGANIC_FERTILIZERS["pH_low"])
    elif ph_val > ph_req["max"] + ph_buffer:
        ph_status = "alkaline"
        issues.append(f"pH too alkaline ({ph_val} vs max {ph_req['max']})")
        suggestions.extend(ORGANIC_FERTILIZERS["pH_high"])

    params["pH"] = {
        "value": ph_val,
        "required_min": ph_req["min"],
        "required_max": ph_req["max"],
        "required_mean": ph_req["mean"],
        "status": ph_status
    }

    suitable = len(issues) == 0

    return {
        "crop": crop_name,
        "suitable": suitable,
        "verdict": "✅ SUITABLE" if suitable else "❌ NOT SUITABLE",
        "issues": issues,
        "suggestions": list(dict.fromkeys(suggestions)),  # deduplicated
        "params": params,
        "sensor_raw": sensor_data
    }
```

---

## STEP 4 — FASTAPI BACKEND (`main.py`)

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import asyncio
import json
import threading

from sensor_reader import read_sensor_data
from soil_engine import evaluate_soil
from dataset_loader import load_crop_data, list_all_crops

app = FastAPI(title="Soil Suitability API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend
app.mount("/static", StaticFiles(directory="static"), name="static")

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


@app.websocket("/ws/{crop_name}")
async def websocket_endpoint(websocket: WebSocket, crop_name: str):
    """
    Real-time WebSocket: pushes updated soil evaluation every 3 seconds.
    """
    await websocket.accept()
    try:
        while True:
            result = evaluate_soil(latest_sensor_data, crop_name)
            await websocket.send_text(json.dumps(result))
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        print(f"Client disconnected from /ws/{crop_name}")
```

Run with:
```bash
pip install fastapi uvicorn pyserial pandas scikit-learn
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

## STEP 5 — FRONTEND (`static/index.html`)

### Design Direction:
- **Aesthetic**: Organic/natural dark theme — deep earth tones (dark green, soil brown, cream)
- **Font**: `Playfair Display` (headings) + `DM Sans` (body)
- **Key Feature**: Live pulsing sensor readout + animated suitability verdict card
- **Real-time**: WebSocket connection, auto-refreshing every 3s

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>SoilSense — Real-Time Crop Suitability</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --bg: #0d1a0e;
      --surface: #141f15;
      --card: #1a2b1b;
      --accent: #5cb85c;
      --accent2: #a8d5a2;
      --warn: #e8a838;
      --danger: #c0392b;
      --text: #e8f0e9;
      --muted: #7a9b7c;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'DM Sans', sans-serif;
      min-height: 100vh;
    }

    header {
      padding: 2rem 3rem;
      border-bottom: 1px solid #2a3d2b;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    header h1 {
      font-family: 'Playfair Display', serif;
      font-size: 2rem;
      color: var(--accent2);
    }

    .live-dot {
      width: 10px; height: 10px;
      background: var(--accent);
      border-radius: 50%;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 rgba(92,184,92,0.4); }
      50% { opacity: 0.8; transform: scale(1.2); box-shadow: 0 0 0 8px rgba(92,184,92,0); }
    }

    main { max-width: 1200px; margin: 0 auto; padding: 2rem 3rem; }

    .crop-selector {
      margin-bottom: 2.5rem;
      display: flex;
      gap: 1rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .crop-selector label {
      font-size: 1.1rem;
      color: var(--accent2);
      font-weight: 500;
    }

    select {
      background: var(--card);
      border: 1px solid #3a5c3b;
      color: var(--text);
      padding: 0.7rem 1.2rem;
      border-radius: 8px;
      font-size: 1rem;
      font-family: 'DM Sans', sans-serif;
      cursor: pointer;
      min-width: 220px;
    }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }

    .sensor-card {
      background: var(--card);
      border: 1px solid #2a3d2b;
      border-radius: 14px;
      padding: 1.5rem;
    }

    .sensor-card h2 {
      font-family: 'Playfair Display', serif;
      font-size: 1.2rem;
      color: var(--accent2);
      margin-bottom: 1.2rem;
    }

    .param-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0;
      border-bottom: 1px solid #1e301f;
    }

    .param-label { color: var(--muted); font-size: 0.9rem; }

    .param-value { font-size: 1.1rem; font-weight: 500; }

    .status-badge {
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 20px;
      font-weight: 500;
    }

    .status-optimal { background: rgba(92,184,92,0.2); color: var(--accent); }
    .status-low     { background: rgba(232,168,56,0.2); color: var(--warn); }
    .status-high    { background: rgba(192,57,43,0.2);  color: var(--danger); }
    .status-acidic  { background: rgba(232,168,56,0.2); color: var(--warn); }
    .status-alkaline { background: rgba(192,57,43,0.2); color: var(--danger); }

    .verdict-card {
      grid-column: 1 / -1;
      background: var(--card);
      border-radius: 16px;
      padding: 2rem;
      text-align: center;
      border: 2px solid transparent;
      transition: border-color 0.4s, background 0.4s;
    }

    .verdict-card.suitable   { border-color: var(--accent); }
    .verdict-card.unsuitable { border-color: var(--danger); }

    .verdict-text {
      font-family: 'Playfair Display', serif;
      font-size: 2.5rem;
      font-weight: 900;
      margin-bottom: 0.5rem;
    }

    .issues-list, .suggestions-list {
      text-align: left;
      margin-top: 1.5rem;
      list-style: none;
    }

    .issues-list li::before { content: "⚠ "; color: var(--warn); }
    .suggestions-list li::before { content: "→ "; color: var(--accent); }

    .issues-list li, .suggestions-list li {
      padding: 0.4rem 0;
      font-size: 0.95rem;
      color: var(--text);
      line-height: 1.5;
    }

    h3.section-title {
      font-family: 'Playfair Display', serif;
      font-size: 1rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-top: 1.5rem;
    }

    .timestamp { font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem; }
  </style>
</head>
<body>
  <header>
    <div class="live-dot"></div>
    <h1>SoilSense</h1>
    <span style="color:var(--muted); font-size:0.9rem">Real-Time Soil Suitability</span>
  </header>

  <main>
    <div class="crop-selector">
      <label for="cropSelect">Select Crop / Plant:</label>
      <select id="cropSelect"></select>
    </div>

    <div class="grid">
      <!-- Sensor Readings Card -->
      <div class="sensor-card">
        <h2>📡 Live Sensor Readings</h2>
        <div id="sensorReadings">Loading...</div>
      </div>

      <!-- Requirements Card -->
      <div class="sensor-card">
        <h2>🌿 Crop Requirements</h2>
        <div id="cropRequirements">Select a crop above</div>
      </div>

      <!-- Verdict Card -->
      <div class="verdict-card" id="verdictCard">
        <div class="verdict-text" id="verdictText">—</div>
        <div id="verdictDetails"></div>
      </div>
    </div>
    <div class="timestamp" id="lastUpdated"></div>
  </main>

  <script>
    const API = "http://localhost:8000";
    let ws = null;
    let selectedCrop = "";

    // Load crop list
    fetch(`${API}/crops`)
      .then(r => r.json())
      .then(data => {
        const sel = document.getElementById("cropSelect");
        data.crops.forEach(crop => {
          const opt = document.createElement("option");
          opt.value = crop; opt.textContent = crop.charAt(0).toUpperCase() + crop.slice(1);
          sel.appendChild(opt);
        });
        selectedCrop = data.crops[0];
        connectWS();
      });

    document.getElementById("cropSelect").addEventListener("change", e => {
      selectedCrop = e.target.value;
      if (ws) ws.close();
      connectWS();
    });

    function connectWS() {
      ws = new WebSocket(`ws://localhost:8000/ws/${selectedCrop}`);
      ws.onmessage = e => {
        const data = JSON.parse(e.data);
        renderDashboard(data);
      };
      ws.onclose = () => setTimeout(connectWS, 2000);
    }

    function statusBadge(status) {
      return `<span class="status-badge status-${status}">${status}</span>`;
    }

    function renderDashboard(data) {
      if (data.error) {
        document.getElementById("verdictText").textContent = data.error;
        return;
      }

      const params = data.params;

      // Sensor readings
      document.getElementById("sensorReadings").innerHTML = `
        ${["N","P","K","pH"].map(p => `
          <div class="param-row">
            <span class="param-label">${p === "pH" ? "pH" : `${p} (mg/kg)`}</span>
            <span class="param-value">${params[p].value}</span>
            ${statusBadge(params[p].status)}
          </div>`).join("")}
      `;

      // Crop requirements
      document.getElementById("cropRequirements").innerHTML = `
        ${["N","P","K","pH"].map(p => `
          <div class="param-row">
            <span class="param-label">${p === "pH" ? "pH" : `${p}`} range</span>
            <span class="param-value" style="font-size:0.95rem; color:var(--muted)">
              ${params[p].required_min} – ${params[p].required_max}
              <span style="font-size:0.8rem">(avg ${params[p].required_mean})</span>
            </span>
          </div>`).join("")}
      `;

      // Verdict
      const card = document.getElementById("verdictCard");
      const text = document.getElementById("verdictText");
      card.className = `verdict-card ${data.suitable ? "suitable" : "unsuitable"}`;
      text.style.color = data.suitable ? "var(--accent)" : "var(--danger)";
      text.textContent = data.verdict;

      let details = "";

      if (!data.suitable) {
        if (data.issues.length) {
          details += `<h3 class="section-title">Issues Detected</h3>
            <ul class="issues-list">${data.issues.map(i => `<li>${i}</li>`).join("")}</ul>`;
        }
        if (data.suggestions.length) {
          details += `<h3 class="section-title">Recommended Organic Treatments</h3>
            <ul class="suggestions-list">${data.suggestions.map(s => `<li>${s}</li>`).join("")}</ul>`;
        }
      } else {
        details = `<p style="color:var(--muted); margin-top:0.5rem">
          Soil conditions are within optimal range for <strong>${data.crop}</strong>. Proceed with planting!
        </p>`;
      }

      document.getElementById("verdictDetails").innerHTML = details;
      document.getElementById("lastUpdated").textContent =
        `Last updated: ${new Date().toLocaleTimeString()}`;
    }
  </script>
</body>
</html>
```

---

## STEP 6 — PROJECT STRUCTURE

```
soil-suitability-app/
│
├── main.py                  # FastAPI server + WebSocket
├── sensor_reader.py         # Arduino serial reader
├── soil_engine.py           # Suitability evaluation logic
├── dataset_loader.py        # Kaggle dataset handler
├── crop_data.csv            # Kaggle crop recommendation dataset
│
└── static/
    └── index.html           # Frontend (served by FastAPI)
```

---

## STEP 7 — HOW TO RUN (End-to-End)

```bash
# 1. Install dependencies
pip install fastapi uvicorn pyserial pandas scikit-learn

# 2. Place crop_data.csv in root folder (from Kaggle)

# 3. Connect Arduino via USB (update SERIAL_PORT in sensor_reader.py)

# 4. Start the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 5. Open browser
# http://localhost:8000/static/index.html
```

---

## STEP 8 — WHAT THE WEBSITE SHOWS IN REAL TIME

| Section | Details |
|---|---|
| 📡 Live Sensor Readings | N, P, K, pH values with status badges (optimal / low / high) |
| 🌿 Crop Requirements | Min–max–mean ranges for selected crop from Kaggle dataset |
| ✅/❌ Verdict | Large, clear SUITABLE or NOT SUITABLE verdict |
| ⚠ Issues | Specific parameter mismatches listed clearly |
| → Suggestions | Specific organic fertilizers (from paper Table I) to fix each issue |
| 🕐 Timestamp | Shows when data was last updated |

---

## FUTURE EXTENSIONS (as mentioned in paper)

- Add **temperature, humidity, rainfall** from additional sensors for deeper matching
- Integrate **ML model (Fine Decision Tree 81.6% accuracy)** from MATLAB into Python via ONNX export
- Add **historical logging** with SQLite and trend charts
- **Mobile responsive** layout for use in the field
- **Alerts via SMS/email** when soil goes out of range
- **Multi-language support** (Kannada, Telugu) for local farmers

---

*Based on: "AI-Based Soil Characterization for Enhanced Organic Fertilization Practices" — Dabbara Prashanth et al., GITAM University*
