import argparse
import os
import sqlite3

import pandas as pd

from pipeline.clean import DROP_RULES, FLAG_RULES, PAYMENT_TYPES, RATE_CODES, VENDORS
from pipeline.config import CHUNK_SIZE, DB_PATH, PROCESSED_DIR, SCHEMA_PATH

TRIP_COLUMNS = [
    "vendor_id", "pickup_datetime", "dropoff_datetime", "pickup_date",
    "passenger_count",
    "trip_distance", "rate_code_id", "store_and_fwd_flag",
    "pu_location_id", "do_location_id",
    "payment_type_id", "fare_amount", "extra", "mta_tax", "tip_amount",
    "tolls_amount",
    "improvement_surcharge", "total_amount", "congestion_surcharge", "airport_fee",
    "trip_duration_min", "avg_speed_mph", "fare_per_mile", "tip_pct",
    "pickup_hour",
    "day_of_week", "is_weekend", "time_of_day", "is_airport_trip", "is_suspicious",
    "suspicious_reason",
]

SUMMARY_SQL = """
INSERT INTO zone_stats
SELECT z.location_id,
       COALESCE(p.pickups, 0), COALESCE(d.dropoffs, 0), COALESCE(p.revenue, 0),
       p.avg_fare, p.avg_speed_mph, p.avg_fare_per_mile, p.avg_tip_pct
FROM zones z
LEFT JOIN (SELECT pu_location_id AS location_id, COUNT(*) AS pickups,
                  ROUND(SUM(total_amount), 2) AS revenue,
                  ROUND(AVG(fare_amount), 2) AS avg_fare,
                  ROUND(AVG(avg_speed_mph), 2) AS avg_speed_mph,
                  ROUND(AVG(fare_per_mile), 2) AS avg_fare_per_mile,
                  ROUND(AVG(tip_pct), 2) AS avg_tip_pct
           FROM trips GROUP BY pu_location_id) p ON p.location_id = z.location_id
LEFT JOIN (SELECT do_location_id AS location_id, COUNT(*) AS dropoffs
           FROM trips GROUP BY do_location_id) d ON d.location_id = z.location_id;

INSERT INTO hourly_stats
SELECT day_of_week, pickup_hour, COUNT(*), AVG(avg_speed_mph), AVG(fare_amount), AVG(tip_pct)
FROM trips GROUP BY day_of_week, pickup_hour;

INSERT INTO daily_stats
SELECT pickup_date, COUNT(*), ROUND(SUM(total_amount), 2), AVG(fare_amount), AVG(avg_speed_mph)
FROM trips GROUP BY pickup_date;
"""


def load(trips, zones, report, db_path=DB_PATH, schema_path=SCHEMA_PATH):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        with open(schema_path, encoding="utf-8") as fh:
            conn.executescript(fh.read())

        conn.executemany("INSERT INTO vendors VALUES (?, ?)", VENDORS.items())
        conn.executemany("INSERT INTO rate_codes VALUES (?, ?)", RATE_CODES.items())
        conn.executemany("INSERT INTO payment_types VALUES (?, ?)", PAYMENT_TYPES.items())
        boroughs = sorted(zones["borough"].unique())
        borough_ids = {name: i for i, name in enumerate(boroughs, start=1)}
        conn.executemany("INSERT INTO boroughs VALUES (?, ?)", [(i, name) for name, i in borough_ids.items()])
        conn.executemany("INSERT INTO zones VALUES (?, ?, ?, ?)",
                         [(int(r.location_id), borough_ids[r.borough], r.zone, r.service_zone)
                          for r in zones.itertuples()])

        trips[TRIP_COLUMNS].to_sql("trips", conn, if_exists="append", index=False,
                                   chunksize=CHUNK_SIZE)
        conn.executescript(SUMMARY_SQL)

        log = [(code, "dropped", desc, report["dropped"].get(code, 0)) for code, desc in DROP_RULES.items()]
        log += [(code, "flagged", desc, report["flagged"].get(code, 0)) for code, desc in FLAG_RULES.items()]
        conn.executemany("INSERT INTO exclusion_log VALUES (?, ?, ?, ?)", log)

        conn.executescript("""
            CREATE INDEX idx_trips_pickup_date ON trips (pickup_date);
            CREATE INDEX idx_trips_pu_location ON trips (pu_location_id);
            CREATE INDEX idx_trips_do_location ON trips (do_location_id);
            CREATE INDEX idx_trips_hour ON trips (pickup_hour);
        """)
        conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM trips").fetchone()[0]
        print(f"Loaded {count:,} trips into {db_path}")
    finally:
        conn.close()


if __name__ == "__main__":
    import json

    parser = argparse.ArgumentParser(description="Load processed trips into SQLite")
    parser.add_argument("--processed-dir", default=PROCESSED_DIR)
    parser.add_argument("--db", default=DB_PATH)
    args = parser.parse_args()
    trips = pd.read_parquet(os.path.join(args.processed_dir, "clean_trips.parquet"))
    zones = pd.read_csv(os.path.join(args.processed_dir, "zones.csv"))
    with open(os.path.join(args.processed_dir, "cleaning_report.json"), encoding="utf-8") as fh:
        report = json.load(fh)
    load(trips, zones, report, args.db)
