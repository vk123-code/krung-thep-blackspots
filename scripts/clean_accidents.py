from pathlib import Path
import json

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import MinMaxScaler

RAW_FILE = Path("data/raw/accident2025.csv")
OUTPUT_DIR = Path("public")

# Bangkok metro focus.
# Keep Bangkok only if you want it tighter.
# For school/Nonthaburi area, keeping Nonthaburi is useful.
FOCUS_PROVINCES = ["กรุงเทพมหานคร", "นนทบุรี", "ปทุมธานี", "สมุทรปราการ"]

EPS_METERS = 750
MIN_SAMPLES = 4
EARTH_RADIUS_METERS = 6_371_000


def read_table(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(
            f"Could not find {path}. Put your CSV inside data/raw and name it accident2025.csv"
        )

    if path.suffix.lower() in [".xlsx", ".xls"]:
        return pd.read_excel(path)

    for encoding in ["utf-8-sig", "utf-8", "cp874"]:
        try:
            return pd.read_csv(path, encoding=encoding)
        except UnicodeDecodeError:
            continue

    raise UnicodeDecodeError("Could not read file with utf-8-sig, utf-8, or cp874.")


def find_col(df: pd.DataFrame, candidates: list[str], required: bool = True) -> str | None:
    normalized = {str(col).strip().lower(): col for col in df.columns}

    for candidate in candidates:
        key = candidate.strip().lower()
        if key in normalized:
            return normalized[key]

    for col in df.columns:
        col_str = str(col).strip().lower()
        for candidate in candidates:
            if candidate.strip().lower() in col_str:
                return col

    if required:
        raise KeyError(
            f"Missing required column. Tried: {candidates}\nAvailable columns: {list(df.columns)}"
        )

    return None


def clean_number(series: pd.Series, fill: float = 0) -> pd.Series:
    return (
        pd.to_numeric(
            series.astype(str).str.replace(",", "", regex=False).str.strip(),
            errors="coerce",
        )
        .fillna(fill)
    )


def safe_float(value, fallback=0.0) -> float:
    try:
        if pd.isna(value):
            return fallback
        return float(value)
    except Exception:
        return fallback


def safe_text(value, fallback="Unknown") -> str:
    if pd.isna(value):
        return fallback
    value = str(value).strip()
    return value if value else fallback


def percentile_safety_score(risk_values: pd.Series) -> pd.Series:
    if len(risk_values) == 1:
        return pd.Series([50], index=risk_values.index)

    scaled = MinMaxScaler().fit_transform(risk_values.to_numpy().reshape(-1, 1)).flatten()
    return np.round(100 - (scaled * 100), 1)


def main():
    print("Reading raw accident file...")
    df = read_table(RAW_FILE)
    df.columns = [str(c).strip() for c in df.columns]

    column_map = {
        "year": find_col(df, ["ปีที่เกิดเหตุ", "year"], required=False),
        "date": find_col(df, ["วันที่เกิดเหตุ", "date"], required=False),
        "time": find_col(df, ["เวลา", "time"], required=False),
        "province": find_col(df, ["จังหวัด", "province"], required=False),
        "district": find_col(df, ["อำเภอ", "เขต", "district", "amphoe"], required=False),
        "agency": find_col(df, ["หน่วยงาน", "agency"], required=False),
        "road": find_col(df, ["สายทาง", "road", "route"], required=False),
        "road_code": find_col(df, ["รหัสสายทาง", "route_code"], required=False),
        "km": find_col(df, ["KM", "กิโลเมตร"], required=False),
        "cause": find_col(df, ["มูลเหตุสันนิษฐาน", "cause"], required=False),
        "crash_type": find_col(df, ["ลักษณะการเกิดเหตุ", "accident type", "crash"], required=False),
        "weather": find_col(df, ["สภาพอากาศ", "weather"], required=False),
        "lat": find_col(df, ["LATITUDE", "latitude", "lat"]),
        "lon": find_col(df, ["LONGITUDE", "longitude", "lon", "lng"]),
        "vehicles": find_col(df, ["รถที่เกิดเหตุ", "vehicles"], required=False),
        "deaths": find_col(df, ["ผู้เสียชีวิต", "deaths", "fatalities"], required=False),
        "serious": find_col(df, ["ผู้บาดเจ็บสาหัส", "serious"], required=False),
        "minor": find_col(df, ["ผู้บาดเจ็บเล็กน้อย", "minor"], required=False),
        "injuries": find_col(df, ["รวมจำนวนผู้บาดเจ็บ", "injuries"], required=False),
        "motorcycles": find_col(df, ["รถจักรยานยนต์", "motorcycle"], required=False),
        "pedestrians": find_col(df, ["คนเดินเท้า", "pedestrian"], required=False),
    }

    out = pd.DataFrame()

    for new_col, old_col in column_map.items():
        if old_col is None:
            out[new_col] = None
        else:
            out[new_col] = df[old_col]

    out["lat"] = clean_number(out["lat"], fill=np.nan)
    out["lon"] = clean_number(out["lon"], fill=np.nan)

    for col in [
        "vehicles",
        "deaths",
        "serious",
        "minor",
        "injuries",
        "motorcycles",
        "pedestrians",
    ]:
        out[col] = clean_number(out[col], fill=0)

    text_cols = [
        "province",
        "district",
        "agency",
        "road",
        "road_code",
        "cause",
        "crash_type",
        "weather",
        "date",
        "time",
        "km",
    ]

    for col in text_cols:
        out[col] = out[col].apply(safe_text)

    before = len(out)

    out = out.dropna(subset=["lat", "lon"])
    out = out[(out["lat"].between(5, 21)) & (out["lon"].between(97, 106))]

    if "province" in out.columns and FOCUS_PROVINCES:
        province_pattern = "|".join(FOCUS_PROVINCES)
        focused = out[out["province"].str.contains(province_pattern, case=False, na=False)]

        if len(focused) >= 20:
            out = focused
        else:
            print("Province filter returned fewer than 20 rows, so keeping all Thai records instead.")

    print(f"Cleaned rows: {len(out)} out of {before}")

    out["severity"] = (
        out["deaths"] * 5
        + out["serious"] * 3
        + out["minor"] * 1
        + out["injuries"] * 0.75
        + out["vehicles"] * 0.2
        + out["motorcycles"] * 0.5
        + out["pedestrians"] * 0.75
    ).round(2)

    print("Running DBSCAN hotspot clustering...")

    coords_radians = np.radians(out[["lat", "lon"]].to_numpy())
    eps_radians = EPS_METERS / EARTH_RADIUS_METERS

    model = DBSCAN(
        eps=eps_radians,
        min_samples=MIN_SAMPLES,
        metric="haversine",
    )

    out["cluster"] = model.fit_predict(coords_radians)

    clustered = out[out["cluster"] != -1].copy()

    hotspots = []

    if not clustered.empty:
        grouped = clustered.groupby("cluster")

        for cluster_id, group in grouped:
            risk = group["severity"].sum() + len(group) * 1.5

            hotspots.append(
                {
                    "cluster": int(cluster_id),
                    "center_lat": round(float(group["lat"].median()), 6),
                    "center_lon": round(float(group["lon"].median()), 6),
                    "accidents": int(len(group)),
                    "severity_sum": round(float(group["severity"].sum()), 2),
                    "risk_index": round(float(risk), 2),
                    "top_road": safe_text(
                        group["road"].mode().iloc[0]
                        if not group["road"].mode().empty
                        else "Unknown"
                    ),
                    "top_cause": safe_text(
                        group["cause"].mode().iloc[0]
                        if not group["cause"].mode().empty
                        else "Unknown"
                    ),
                    "top_weather": safe_text(
                        group["weather"].mode().iloc[0]
                        if not group["weather"].mode().empty
                        else "Unknown"
                    ),
                    "radius_meters": EPS_METERS,
                }
            )

    hotspots = sorted(hotspots, key=lambda x: x["risk_index"], reverse=True)

    for rank, hotspot in enumerate(hotspots, start=1):
        hotspot["rank"] = rank

    area_col = (
        "district"
        if out["district"].notna().any() and (out["district"] != "Unknown").any()
        else "road"
    )

    area = (
        out.groupby(area_col)
        .agg(
            accidents=("lat", "count"),
            severity_sum=("severity", "sum"),
            deaths=("deaths", "sum"),
            injuries=("injuries", "sum"),
            clusters=("cluster", lambda s: int(len(set([x for x in s if x != -1])))),
        )
        .reset_index()
        .rename(columns={area_col: "area_name"})
    )

    area = area[area["area_name"] != "Unknown"]

    area["risk_index"] = (
        area["accidents"] * 1.0
        + area["severity_sum"] * 1.25
        + area["clusters"] * 2.0
    ).round(2)

    area["safety_score"] = percentile_safety_score(area["risk_index"])
    area = area.sort_values("risk_index", ascending=False)

    features = []

    for idx, row in out.reset_index(drop=True).iterrows():
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [safe_float(row["lon"]), safe_float(row["lat"])],
                },
                "properties": {
                    "id": int(idx + 1),
                    "date": safe_text(row["date"]),
                    "time": safe_text(row["time"]),
                    "province": safe_text(row["province"]),
                    "district": safe_text(row["district"]),
                    "agency": safe_text(row["agency"]),
                    "road": safe_text(row["road"]),
                    "road_code": safe_text(row["road_code"]),
                    "km": safe_text(row["km"]),
                    "cause": safe_text(row["cause"]),
                    "crash_type": safe_text(row["crash_type"]),
                    "weather": safe_text(row["weather"]),
                    "vehicles": safe_float(row["vehicles"]),
                    "deaths": safe_float(row["deaths"]),
                    "serious_injuries": safe_float(row["serious"]),
                    "minor_injuries": safe_float(row["minor"]),
                    "total_injuries": safe_float(row["injuries"]),
                    "severity": safe_float(row["severity"]),
                    "cluster": int(row["cluster"]),
                    "is_hotspot": bool(row["cluster"] != -1),
                },
            }
        )

    geojson = {
        "type": "FeatureCollection",
        "name": "Krung Thep Blackspots",
        "features": features,
    }

    OUTPUT_DIR.mkdir(exist_ok=True)

    (OUTPUT_DIR / "accidents.geojson").write_text(
        json.dumps(geojson, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    (OUTPUT_DIR / "hotspots.json").write_text(
        json.dumps(hotspots, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    area.to_json(
        OUTPUT_DIR / "safety_scores.json",
        orient="records",
        force_ascii=False,
        indent=2,
    )

    out.to_csv(
        OUTPUT_DIR / "krungthep_blackspots_cleaned.csv",
        index=False,
        encoding="utf-8-sig",
    )

    meta = {
        "project": "Krung Thep Blackspots",
        "raw_file": str(RAW_FILE),
        "records_after_cleaning": int(len(out)),
        "hotspot_count": int(len(hotspots)),
        "focus_provinces": FOCUS_PROVINCES,
        "cluster_method": "DBSCAN with haversine distance",
        "eps_meters": EPS_METERS,
        "min_samples": MIN_SAMPLES,
        "area_score_type": area_col,
    }

    (OUTPUT_DIR / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("Done.")
    print(f"Created {OUTPUT_DIR / 'accidents.geojson'}")
    print(f"Created {OUTPUT_DIR / 'hotspots.json'}")
    print(f"Created {OUTPUT_DIR / 'safety_scores.json'}")
    print(f"Created {OUTPUT_DIR / 'krungthep_blackspots_cleaned.csv'}")
    print(f"Hotspots found: {len(hotspots)}")


if __name__ == "__main__":
    main()