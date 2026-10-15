import argparse
import glob
import json
import os
import re
import tempfile
import zipfile

import numpy as np
import pandas as pd

from pipeline import algorithms

AIRPORT_ZONES = {1, 132, 138}
UNKNOWN_ZONES = {264, 265}
MAX_DURATION_MIN = 6 * 60
MAX_DISTANCE_MI = 100
MAX_FARE = 500
MAX_SPEED_MPH = 80
FARE_PER_MILE_IQR_MULTIPLIER = 3.0

VENDORS = {1: "Creative Mobile Technologies", 2: "Curb Mobility", 6: "Myle Technologies", 7: "Helix"}
RATE_CODES = {1: "Standard rate", 2: "JFK", 3: "Newark", 4: "Nassau or Westchester",
              5: "Negotiated fare", 6: "Group ride", 99: "Unknown"}
PAYMENT_TYPES = {0: "Flex fare", 1: "Credit card", 2: "Cash", 3: "No charge", 4: "Dispute",
                 5: "Unknown", 6: "Voided trip"}
DROP_RULES = {
    "duplicate": "Exact duplicate of another record",
    "missing_timestamp": "Pickup or dropoff timestamp is null",
    "outside_period": "Pickup falls outside the month covered by the file",
    "non_positive_duration": "Dropoff is at or before pickup",
    "duration_too_long": f"Trip lasted longer than {MAX_DURATION_MIN // 60} hours",
    "non_positive_distance": "Trip distance is zero or negative",
    "distance_too_long": f"Trip distance above {MAX_DISTANCE_MI} miles",
    "non_positive_fare": "Fare <= 0 or negative total (refunds, voids)",
    "fare_too_high": f"Fare above ${MAX_FARE}",
    "impossible_speed": f"Average speed above {MAX_SPEED_MPH} mph",
    "unknown_location_id": "Pickup or dropoff ID not present in the zone lookup",
}
FLAG_RULES = {
    "unknown_zone": "Pickup or dropoff in zone 264/265 (Unknown / outside NYC)",
    "missing_passenger_count": "Passenger count null or 0 (set to NULL)",
    "missing_rate_code": "RatecodeID null or 99 (mapped to Unknown)",
    "fare_per_mile_outlier": f"Fare per mile outside Tukey fences (IQR x {FARE_PER_MILE_IQR_MULTIPLIER})",
}
MONEY_COLS = ["fare_amount", "extra", "mta_tax", "tip_amount", "tolls_amount",
              "improvement_surcharge", "congestion_surcharge", "airport_fee",
              "total_amount"]


def iqr_fences(values, k=1.5):
    """Tukey fences via the hand-written quickselect in algorithms.py, ignoring NaNs."""
    vals = [v for v in values if v is not None and not np.isnan(v)]
    if not vals:
        return float("-inf"), float("inf"), float("nan"), float("nan")
    low, high, q1, q3 = algorithms.iqr_fences(vals, k)
    return float(low), float(high), float(q1), float(q3)


def find_raw_files(raw_dir):
    def first(patterns):
        for pattern in patterns:
            matches = glob.glob(os.path.join(raw_dir, pattern))
            if matches:
                return matches[0]
        return None

    files = {
        "trips": first(["*tripdata*.parquet", "*.parquet", "*tripdata*.csv"]),
        "lookup": first(["*zone_lookup*.csv", "*lookup*.csv"]),
        "spatial": first(["*taxi_zones*.geojson", "*taxi_zones*.json", "*.geojson",
                          "*taxi_zones*.zip", "*.zip"]),
    }
    missing = [name for name, path in files.items() if path is None]
    if missing:
        raise FileNotFoundError(
            f"Missing raw file(s) {missing} in {raw_dir}. Expected a yellow_tripdata *.parquet, "
            "taxi_zone_lookup.csv and taxi_zones (.geojson or shapefile .zip)."
        )
    return files


def load_zone_lookup(path):
    zones = pd.read_csv(path)
    zones.columns = [c.strip().lower() for c in zones.columns]
    zones = zones.rename(columns={"locationid": "location_id"})
    zones["location_id"] = zones["location_id"].astype(int)
    zones["borough"] = zones["borough"].fillna("Unknown").replace({"N/A": "Unknown"}).str.strip()
    zones["zone"] = zones["zone"].fillna("Unknown").str.strip()
    zones["service_zone"] = zones["service_zone"].fillna("Unknown").str.strip()
    return zones.drop_duplicates("location_id")[["location_id", "borough", "zone", "service_zone"]]


def _map_coords(coords, fn):
    if isinstance(coords[0], (int, float)):
        return fn(coords)
    return [_map_coords(c, fn) for c in coords]


def _first_point(coords):
    while not isinstance(coords[0], (int, float)):
        coords = coords[0]
    return coords


def _read_shapefile_zip(path):
    import shapefile

    tmp = tempfile.mkdtemp(prefix="taxi_zones_")
    with zipfile.ZipFile(path) as zf:
        zf.extractall(tmp)
    shp = glob.glob(os.path.join(tmp, "**", "*.shp"), recursive=True)
    if not shp:
        raise FileNotFoundError(f"No .shp file inside {path}")
    reader = shapefile.Reader(shp[0])
    fields = [f[0] for f in reader.fields[1:]]
    features = []
    for sr in reader.shapeRecords():
        features.append({
            "type": "Feature",
            "properties": dict(zip(fields, sr.record)),
            "geometry": sr.shape.__geo_interface__,
        })
    return {"type": "FeatureCollection", "features": features}


def load_zone_geometry(path, zones):
    if path.lower().endswith(".zip"):
        geo = _read_shapefile_zip(path)
    else:
        with open(path, encoding="utf-8") as fh:
            geo = json.load(fh)

    # Shapefiles ship in NY State Plane feet (EPSG:2263); reproject to lon/lat if needed.
    sample = next(f for f in geo["features"] if f.get("geometry"))
    x, y = _first_point(sample["geometry"]["coordinates"])[:2]
    if abs(x) > 180 or abs(y) > 90:
        from pyproj import Transformer
        transformer = Transformer.from_crs("EPSG:2263", "EPSG:4326", always_xy=True)
        project = lambda p: list(transformer.transform(p[0], p[1]))
    else:
        project = lambda p: [p[0], p[1]]
    round5 = lambda p: [round(v, 5) for v in project(p)]

    names = zones.set_index("location_id")
    features = []
    for feat in geo["features"]:
        if not feat.get("geometry"):
            continue
        props = {k.lower(): v for k, v in feat["properties"].items()}
        loc = props.get("locationid", props.get("location_id", props.get("objectid")))
        loc = int(float(loc))
        geom = feat["geometry"]
        features.append({
            "type": "Feature",
            "properties": {
                "location_id": loc,
                "zone": names.at[loc, "zone"] if loc in names.index else props.get("zone"),
                "borough": names.at[loc, "borough"] if loc in names.index else props.get("borough"),
            },
            "geometry": {"type": geom["type"], "coordinates": _map_coords(geom["coordinates"], round5)},
        })
    return {"type": "FeatureCollection", "features": features}


def _read_csv_sample(path, sample=None, chunksize=500_000):
    """Stream a large trip CSV in chunks, keeping a uniform random sample from each one."""
    frac = 1.0
    if sample:
        with open(path, "rb") as fh:
            total = sum(1 for _ in fh) - 1
        frac = min(1.0, sample / total) if total > 0 else 1.0
        print(f"Sampling {frac:.2%} of {total:,} CSV rows")
    parts = []
    for i, chunk in enumerate(pd.read_csv(path, chunksize=chunksize, low_memory=False)):
        parts.append(chunk.sample(frac=frac, random_state=42 + i) if frac < 1 else chunk)
    return pd.concat(parts, ignore_index=True)


def load_trips(path, sample=None):
    if path.lower().endswith(".csv"):
        df = _read_csv_sample(path, sample)
    else:
        df = pd.read_parquet(path)
    df.columns = [c.lower() for c in df.columns]
    df = df.rename(columns={
        "vendorid": "vendor_id",
        "tpep_pickup_datetime": "pickup_datetime",
        "tpep_dropoff_datetime": "dropoff_datetime",
        "ratecodeid": "rate_code_id",
        "pulocationid": "pu_location_id",
        "dolocationid": "do_location_id",
        "payment_type": "payment_type_id",
    })
    for col in MONEY_COLS:
        if col not in df.columns:
            df[col] = np.nan
    for col in ["passenger_count", "rate_code_id", "store_and_fwd_flag", "payment_type_id"]:
        if col not in df.columns:
            df[col] = np.nan
    if sample and sample < len(df):
        df = df.sample(n=sample, random_state=42)
    return df.reset_index(drop=True)


def infer_period(path, pickups):
    match = re.search(r"(\d{4})-(\d{2})", os.path.basename(path))
    if match:
        start = pd.Timestamp(int(match.group(1)), int(match.group(2)), 1)
    else:
        start = pickups.dt.to_period("M").mode()[0].to_timestamp()
    return start, start + pd.offsets.MonthBegin(1)


def time_of_day(hours):
    bins = [-1, 5, 9, 15, 19, 23]
    labels = ["Late night", "Morning rush", "Midday", "Evening rush", "Evening"]
    return pd.cut(hours, bins=bins, labels=labels).astype(str)


def clean_trips(df, zones, period):
    df = df.copy()
    raw_rows = len(df)
    reason = pd.Series(pd.NA, index=df.index, dtype="object")

    def drop(code, mask):
        mask = mask.fillna(False).astype(bool) & reason.isna()
        reason.loc[mask] = code

    df["pickup_datetime"] = pd.to_datetime(df["pickup_datetime"], errors="coerce")
    df["dropoff_datetime"] = pd.to_datetime(df["dropoff_datetime"], errors="coerce")
    df["trip_distance"] = pd.to_numeric(df["trip_distance"], errors="coerce")
    duration = (df["dropoff_datetime"] - df["pickup_datetime"]).dt.total_seconds() / 60
    df["trip_duration_min"] = duration
    hours = duration / 60
    speed = df["trip_distance"] / hours.where(hours > 0)

    drop("duplicate", df.duplicated(keep="first"))
    drop("missing_timestamp", df["pickup_datetime"].isna() | df["dropoff_datetime"].isna())
    drop("outside_period", (df["pickup_datetime"] < period[0]) | (df["pickup_datetime"] >= period[1]))
    drop("non_positive_duration", duration <= 0)
    drop("duration_too_long", duration > MAX_DURATION_MIN)
    drop("non_positive_distance", df["trip_distance"].isna() | (df["trip_distance"] <= 0))
    drop("distance_too_long", df["trip_distance"] > MAX_DISTANCE_MI)
    drop("non_positive_fare", df["fare_amount"].isna() | (df["fare_amount"] <= 0) | (df["total_amount"] < 0))
    drop("fare_too_high", df["fare_amount"] > MAX_FARE)
    drop("impossible_speed", speed > MAX_SPEED_MPH)
    known = set(zones["location_id"])
    drop("unknown_location_id", ~df["pu_location_id"].isin(known) | ~df["do_location_id"].isin(known))

    excluded = df[reason.notna()].copy()
    excluded["exclusion_reason"] = reason[reason.notna()]
    df = df[reason.isna()].copy()

    df["avg_speed_mph"] = df["trip_distance"] / (df["trip_duration_min"] / 60)
    df["vendor_id"] = pd.to_numeric(df["vendor_id"], errors="coerce").astype("Int64")
    pax = pd.to_numeric(df["passenger_count"], errors="coerce").astype(float)
    missing_pax = pax.isna() | (pax == 0)
    df["passenger_count"] = pax.where(~missing_pax).round().astype("Int64")
    rate = pd.to_numeric(df["rate_code_id"], errors="coerce")
    missing_rate = rate.isna() | ~rate.isin(list(RATE_CODES)) | (rate == 99)
    df["rate_code_id"] = rate.where(~missing_rate, 99).astype(int)
    pay = pd.to_numeric(df["payment_type_id"], errors="coerce").fillna(5).astype(int)
    pay[~pay.isin(list(PAYMENT_TYPES))] = 5
    df["payment_type_id"] = pay
    df["store_and_fwd_flag"] = df["store_and_fwd_flag"].map({"Y": 1, "N": 0}).astype("Int64")
    df["pu_location_id"] = df["pu_location_id"].astype(int)
    df["do_location_id"] = df["do_location_id"].astype(int)
    for col in MONEY_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce").astype(float).round(2)

    df["trip_duration_min"] = df["trip_duration_min"].round(2)
    df["avg_speed_mph"] = df["avg_speed_mph"].round(2)
    df["fare_per_mile"] = (df["fare_amount"] / df["trip_distance"]).round(2)
    card = df["payment_type_id"] == 1
    df["tip_pct"] = np.where(card, (df["tip_amount"] / df["fare_amount"] * 100).round(2), np.nan)
    df["pickup_hour"] = df["pickup_datetime"].dt.hour
    df["day_of_week"] = df["pickup_datetime"].dt.dayofweek
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["time_of_day"] = time_of_day(df["pickup_hour"])
    df["is_airport_trip"] = (df["pu_location_id"].isin(AIRPORT_ZONES)
                             | df["do_location_id"].isin(AIRPORT_ZONES)
                             | df["rate_code_id"].isin([2, 3])).astype(int)
    df["pickup_date"] = df["pickup_datetime"].dt.strftime("%Y-%m-%d")
    df["pickup_datetime"] = df["pickup_datetime"].dt.strftime("%Y-%m-%dT%H:%M:%S")
    df["dropoff_datetime"] = df["dropoff_datetime"].dt.strftime("%Y-%m-%dT%H:%M:%S")

    low, high, q1, q3 = iqr_fences(df["fare_per_mile"].tolist(), FARE_PER_MILE_IQR_MULTIPLIER)
    flags = {
        "unknown_zone": df["pu_location_id"].isin(UNKNOWN_ZONES) | df["do_location_id"].isin(UNKNOWN_ZONES),
        "missing_passenger_count": missing_pax,
        "missing_rate_code": missing_rate,
        "fare_per_mile_outlier": (df["fare_per_mile"] < low) | (df["fare_per_mile"] > high),
    }
    flag_text = pd.Series("", index=df.index)
    for code, mask in flags.items():
        flag_text = flag_text.where(~mask, flag_text + code + ";")
    flag_text = flag_text.str.rstrip(";")
    df["suspicious_reason"] = flag_text.where(flag_text != "")
    df["is_suspicious"] = df["suspicious_reason"].notna().astype(int)

    report = {
        "period": [str(period[0].date()), str(period[1].date())],
        "raw_rows": int(raw_rows),
        "kept_rows": int(len(df)),
        "dropped_rows": int(len(excluded)),
        "dropped": {code: int((excluded["exclusion_reason"] == code).sum()) for code in DROP_RULES},
        "flagged": {code: int(mask.sum()) for code, mask in flags.items()},
        "fare_per_mile_fences": {"q1": q1, "q3": q3, "low": low, "high": high},
    }
    return df.reset_index(drop=True), excluded, report


def run(raw_dir, processed_dir, sample=None):
    os.makedirs(processed_dir, exist_ok=True)
    files = find_raw_files(raw_dir)
    print(f"Trips:   {files['trips']}\nLookup:  {files['lookup']}\nSpatial: {files['spatial']}")

    zones = load_zone_lookup(files["lookup"])
    geo = load_zone_geometry(files["spatial"], zones)
    with open(os.path.join(processed_dir, "taxi_zones.geojson"), "w", encoding="utf-8") as fh:
        json.dump(geo, fh, separators=(",", ":"))
    print(f"Zones:   {len(zones)} lookup rows, {len(geo['features'])} polygons")

    trips = load_trips(files["trips"], sample)
    period = infer_period(files["trips"], pd.to_datetime(trips["pickup_datetime"], errors="coerce"))
    print(f"Loaded {len(trips):,} raw trips for {period[0]:%Y-%m}")
    clean, excluded, report = clean_trips(trips, zones, period)

    excluded.to_csv(os.path.join(processed_dir, "excluded_records.csv"), index=False)
    clean.to_parquet(os.path.join(processed_dir, "clean_trips.parquet"), index=False)
    zones.to_csv(os.path.join(processed_dir, "zones.csv"), index=False)
    report["drop_rules"] = DROP_RULES
    report["flag_rules"] = FLAG_RULES
    with open(os.path.join(processed_dir, "cleaning_report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, default=float)
    print(f"Kept {report['kept_rows']:,}, dropped {report['dropped_rows']:,}")
    return clean, zones, report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("raw_dir", nargs="?", default="data/raw")
    parser.add_argument("processed_dir", nargs="?", default="data/processed")
    parser.add_argument("--sample", type=int, default=None)
    args = parser.parse_args()
    run(args.raw_dir, args.processed_dir, args.sample)
