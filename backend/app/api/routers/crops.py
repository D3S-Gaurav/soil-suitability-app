from fastapi import APIRouter
from ...data.loader import load_crop_data, list_all_crops
from ...services.rules_engine import evaluate_soil, evaluate_all_crops
from ...services.sensor_service import get_sensor_state

router = APIRouter(tags=["crops"])

@router.get("/crops")
def get_crops():
    df = load_crop_data()
    return {"crops": list_all_crops(df)}

@router.get("/evaluate/{crop_name}")
def evaluate(crop_name: str):
    state = get_sensor_state()
    return evaluate_soil(state.get("latest_data"), crop_name)

@router.get("/evaluate_all")
def evaluate_all():
    state = get_sensor_state()
    return {"suitable_crops": evaluate_all_crops(state.get("latest_data"))}
