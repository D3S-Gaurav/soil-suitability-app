from ..data.loader import get_crop_requirements, load_crop_data, list_all_crops

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

def evaluate_soil(sensor_data: dict, crop_name: str, df=None) -> dict:
    if df is None:
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

def evaluate_all_crops(sensor_data: dict) -> list:
    df = load_crop_data()
    suitable_crops = []
    for crop in list_all_crops(df):
        res = evaluate_soil(sensor_data, crop, df)
        if res.get("suitable"):
            suitable_crops.append(crop)
    return sorted(suitable_crops)
