from fastapi import APIRouter, Form, UploadFile, File
import pandas as pd
import io
from fastapi.responses import JSONResponse
from ...services.ai_service import analyze_soil_data
# We'd fetch the AI client from a central core config or ai_service
import os
from dotenv import load_dotenv
from google import genai

load_dotenv()
try:
    gemini_client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY", ""))
except Exception as e:
    gemini_client = None
    print(f"Gemini API Config Warning: {e}")

router = APIRouter(tags=["analyze"])

@router.get("/api/gemini-health")
def gemini_health():
    """Lightweight check: is the Gemini API reachable and within quota?"""
    if not gemini_client:
        return {"status": "not_initialized", "message": "GenAI client not initialized. Check GOOGLE_API_KEY."}
    try:
        response = gemini_client.models.generate_content(
            model='gemini-2.0-flash',
            contents='Reply with only the word OK.',
        )
        if response and response.text:
            return {"status": "available", "message": "Gemini API is operational."}
        return {"status": "error", "message": "Gemini returned empty response."}
    except Exception as e:
        err_msg = str(e)
        if "RESOURCE_EXHAUSTED" in err_msg or "429" in err_msg:
            return {"status": "rate_limited", "message": "API quota exceeded. Will retry automatically."}
        return {"status": "error", "message": err_msg}

@router.post("/api/analyze")
def analyze(sensor_data: dict):
    if not any(k in sensor_data for k in ["N", "nitrogen"]):
        return JSONResponse(status_code=400, content={"error": "Missing required fields in payload"})
    try:
        analysis = analyze_soil_data(sensor_data)
        return {"success": True, "analysis": analysis}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"AI Analysis failed: {str(e)}"})

@router.post("/webhook/analyze-soil")
async def analyze_soil_webhook(
    crop_type: str = Form(...), 
    file: UploadFile = File(...)
):
    try:
        if not gemini_client:
            return {"status": "error", "message": "GenAI client not initialized"}
            
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

        response = gemini_client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt,
        )
        
        return {
            "status": "success",
            "crop": crop_type,
            "ai_verdict": response.text
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
