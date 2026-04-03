import pandas as pd
import os

DATASET_PATH = os.path.join(os.path.dirname(__file__), "crop_data.csv")

def load_crop_data():
    try:
        df = pd.read_csv(DATASET_PATH)
    except FileNotFoundError:
        # Create a dummy dataframe if the file is not found
        print("Warning: crop_data.csv not found. Falling back to dummy dataset.")
        data = {
            "N": [90, 85, 60, 74, 78],
            "P": [42, 58, 55, 35, 42],
            "K": [43, 41, 44, 40, 42],
            "temperature": [20.8, 21.7, 23.0, 26.4, 20.1],
            "humidity": [82.0, 80.3, 82.3, 80.1, 81.6],
            "ph": [6.5, 7.0, 7.8, 6.9, 7.6],
            "rainfall": [202.9, 226.6, 263.9, 242.8, 262.7],
            "label": ["rice", "rice", "rice", "rice", "rice"]
        }
        data2 = {
            "N": [10, 15, 20, 25, 30],
            "P": [15, 20, 25, 30, 35],
            "K": [20, 25, 30, 35, 40],
            "temperature": [20.8, 21.7, 23.0, 26.4, 20.1],
            "humidity": [82.0, 80.3, 82.3, 80.1, 81.6],
            "ph": [6.5, 7.0, 7.8, 6.9, 7.6],
            "rainfall": [202.9, 226.6, 263.9, 242.8, 262.7],
            "label": ["maize", "maize", "maize", "maize", "maize"]
        }
        df1 = pd.DataFrame(data)
        df2 = pd.DataFrame(data2)
        df = pd.concat([df1, df2], ignore_index=True)

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
        "N":  {"min": float(crop_df["N"].min()),  "max": float(crop_df["N"].max()),  "mean": round(float(crop_df["N"].mean()), 1)},
        "P":  {"min": float(crop_df["P"].min()),  "max": float(crop_df["P"].max()),  "mean": round(float(crop_df["P"].mean()), 1)},
        "K":  {"min": float(crop_df["K"].min()),  "max": float(crop_df["K"].max()),  "mean": round(float(crop_df["K"].mean()), 1)},
        "pH": {"min": float(crop_df["ph"].min()), "max": float(crop_df["ph"].max()), "mean": round(float(crop_df["ph"].mean()), 2)},
    }

def list_all_crops(df: pd.DataFrame) -> list:
    return sorted(df["label"].astype(str).unique().tolist())
