# Soil Suitability Application V3.0

A hardware-to-UI system for monitoring soil NPK (Nitrogen, Phosphorous, Potassium) levels, pH, moisture, and ambient weather conditions.

A Next.js frontend and FastAPI backend collect data from physical sensors (Wi-Fi or Serial), then cross-reference it against a crop dataset to flag soil deficiencies and suggest organic treatments.

## Architecture

### Frontend
- **Framework:** Next.js (App Router)
- **Styling:** Vanilla CSS — no utility class conflicts
- **Components:** Decoupled (e.g., `VerdictCard`, `GeminiAnalysisUpload`) to keep Virtual DOM churn low during 500ms polling

### Backend
- **Framework:** FastAPI
- **Sensor Telemetry:** Multithreaded Python workers hold persistent connections to hardware over Wi-Fi IP or Serial (COM ports)
- **Rules Engine:** Compares live sensor readings against crop requirements from local datasets
- **Logging:** Hardware connections are written to local JSON for offline debugging and telemetry

## Running the Application

### 1. Start the Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```
*Port 8000. Spawns the daemon ingestion loop on startup.*

### 2. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
*Port 3000.*

---

## Usage

### Gateway
The app opens on the **Gateway** view and won't let you past it without a live sensor connection. Enter the hardware IP (e.g., `192.168.1.100`) and hit **Connect**. On success, the IP goes into session storage and you land on the Dashboard.

> **Dev bypass:** Enter `admin` as the IP to skip the connection check and load mock data.

### Dashboard
Polling every 500ms across three panels:

- **Environment** — temperature and humidity
- **Soil Status** — NPK, pH, moisture
- **Evaluation Engine** — pick a crop, hit **Evaluate**. You get back: whether the soil qualifies, which values are off if not, and what to add (e.g., "Add Bone Meal to increase Phosphorous")

### Exporting Data
"Record Session" captures the live stream as a CSV. Runs in the browser, no dependencies.

## Security Notes
`xlsx` and its NPM forks have known Prototype Pollution CVEs and haven't been actively maintained in years. This project doesn't pull them in — CSV export uses native browser APIs.