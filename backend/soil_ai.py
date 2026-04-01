import os
import json
import anthropic

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

def analyze_soil_data(sensor_data: dict) -> dict:
    """
    Sends sensor JSON to Claude and returns AI-powered soil analysis.
    sensor_data example: {"N": 85, "P": 42, "K": 43, "pH": 6.5, "moisture": 38}
    """
    prompt = f"""
You are an expert agronomist and soil scientist. Analyze the following soil sensor data and provide:

1. **Soil Suitability Score** (0-100)
2. **Crop Recommendations** (top 3 crops suitable for this soil)
3. **Nutrient Analysis** (interpret each NPK value)
4. **Issues Detected** (deficiencies, toxicities, imbalances)
5. **Corrective Actions** (what fertilizers or amendments to add)
6. **Confidence Level** (how confident you are in this analysis)

Sensor Data (JSON):
{json.dumps(sensor_data, indent=2)}

NPK Reference Ranges:
- Nitrogen (N): Low < 280 kg/ha, Medium 280-560 kg/ha, High > 560 kg/ha
- Phosphorus (P): Low < 11 kg/ha, Medium 11-22 kg/ha, High > 22 kg/ha
- Potassium (K): Low < 110 kg/ha, Medium 110-280 kg/ha, High > 280 kg/ha
- Ideal pH for most crops: 6.0 - 7.0
- Ideal moisture: 40% - 60%

Respond ONLY in valid JSON format (no markdown, no extra text):
{{
  "suitabilityScore": number,
  "grade": "Excellent|Good|Fair|Poor",
  "recommendedCrops": [{{"crop": string, "reason": string, "expectedYield": string}}],
  "nutrientAnalysis": {{"nitrogen": string, "phosphorus": string, "potassium": string}},
  "issuesDetected": [string],
  "correctiveActions": [{{"action": string, "priority": "High|Medium|Low"}}],
  "confidenceLevel": "High|Medium|Low",
  "summary": string
}}
"""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()

    # Extract JSON block if wrapped in markdown
    if "```" in text:
        import re
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            text = match.group(0)

    return json.loads(text)
