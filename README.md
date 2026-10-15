# Urban Mobility Data Explorer

A full-stack application for exploring New York City yellow taxi trips. Raw TLC trip records are cleaned and enriched by a Python pipeline, stored in a normalized SQLite database, served through a Flask API, and visualized in an interactive HTML/CSS/JavaScript dashboard.

## Video Walkthrough

▶️ **[Watch the 5-minute walkthrough](VIDEO_LINK_HERE)**

---

## Project Structure

```
Summative---Urban-Mobility-Analytics/
├── pipeline/                  # Data processing (cleaning + loading)
│   ├── run_pipeline.py        # Entry point: runs clean -> load
│   ├── clean.py               # Cleaning, outlier handling, feature engineering
│   ├── load.py                # Inserts cleaned data into SQLite
│   ├── algorithms.py          # Hand-written MinHeap, top-k, quickselect, IQR fences
│   ├── config.py              # Shared paths and settings
│   └── Database/schema.sql    # Database schema (tables + indexes)
├── backend/                   # Flask API
├── frontend/                  # Dashboard (HTML, CSS, JavaScript)
├── data/
│   ├── raw/                   # Raw TLC files go here (not committed)
│   └── processed/             # Pipeline output (generated)
├── database/mobility.db       # SQLite database (generated)
└── requirements.txt
```

---

## Setup

### 1. Prerequisites

- Python 3.10 or newer
- Git
- A modern web browser

### 2. Clone and install

```bash
git clone https://github.com/chuloezi/Summative---Urban-Mobility-Analytics.git
cd Summative---Urban-Mobility-Analytics

python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Download the data

Download the three official NYC TLC files and place them in `data/raw/`:

| File | Description |
|------|-------------|
| `yellow_tripdata_YYYY-MM.parquet` | Trip records (fact table) |
| `taxi_zone_lookup.csv` | Zone ID → borough / zone / service zone (dimension table) |
| `taxi_zones.geojson` or `taxi_zones.zip` | Zone boundary polygons (spatial metadata) |

```
data/raw/
├── yellow_tripdata_2024-01.parquet
├── taxi_zone_lookup.csv
└── taxi_zones.zip
```

### 4. Build the database

```bash
python pipeline/run_pipeline.py
```

This cleans the raw trips, writes the outputs to `data/processed/`, and creates `database/mobility.db`.
To test quickly on a smaller subset:

```bash
python pipeline/run_pipeline.py --sample 100000
```

### 5. Start the backend

```bash
python backend/app.py
```

The API runs at `http://localhost:5000`.

### 6. Open the frontend

With the backend running, open `frontend/index.html` in your browser.

---

## Data Pipeline

### Integration
`clean.py` loads the trip parquet file, joins pickup and dropoff location IDs to `taxi_zone_lookup.csv`, and converts the zone polygons to GeoJSON (reprojecting shapefiles from NY State Plane to latitude/longitude when needed).

### Cleaning rules
Records that are physically or logically impossible are **excluded** and saved to `data/processed/excluded_records.csv` with their reason:

| Rule | Condition |
|------|-----------|
| `duplicate` | Exact duplicate of another record |
| `missing_timestamp` | Pickup or dropoff time is null |
| `outside_period` | Pickup falls outside the month of the file |
| `non_positive_duration` | Dropoff at or before pickup |
| `duration_too_long` | Trip longer than 6 hours |
| `non_positive_distance` | Distance zero or negative |
| `distance_too_long` | Distance above 100 miles |
| `non_positive_fare` | Fare ≤ 0 or negative total |
| `fare_too_high` | Fare above $500 |
| `impossible_speed` | Average speed above 80 mph |
| `unknown_location_id` | Zone ID not in the lookup table |

Records that are plausible but questionable are **kept and flagged** (`is_suspicious`, `suspicious_reason`):

| Flag | Condition |
|------|-----------|
| `unknown_zone` | Pickup or dropoff in zone 264/265 (Unknown / outside NYC) |
| `missing_passenger_count` | Passenger count null or 0 |
| `missing_rate_code` | Rate code null or 99 |
| `fare_per_mile_outlier` | Fare per mile outside Tukey fences (3 × IQR) |

A summary of every rule and how many rows it affected is written to `data/processed/cleaning_report.json` and the `cleaning_log` table.

### Derived features

| Feature | Formula | Why it matters |
|---------|---------|----------------|
| `trip_duration_min` | dropoff − pickup | Basis for congestion and speed analysis |
| `avg_speed_mph` | distance ÷ duration | Reveals traffic conditions by time and area |
| `fare_per_mile` | fare ÷ distance | Compares trip cost efficiency across zones |
| `tip_pct` | tip ÷ fare × 100 (card trips only) | Rider tipping behaviour |
| `time_of_day` | Late night / Morning rush / Midday / Evening rush / Evening | Groups trips into demand periods |
| `is_weekend`, `is_airport_trip` | From day of week and airport zones / rate codes | Segment comparisons |

---

## Database

SQLite, defined in [`pipeline/Database/schema.sql`](pipeline/Database/schema.sql).

| Table | Purpose |
|-------|---------|
| `trips` | One row per cleaned trip (fact table) |
| `zones` | Taxi zones: borough, zone name, service zone |
| `vendors`, `rate_codes`, `payment_types` | Lookup tables for coded fields |
| `zone_stats` | Pre-computed pickups, dropoffs and revenue per zone |
| `cleaning_log` | Every cleaning rule and how many rows it affected |

Indexes on `pickup_date`, `pu_location_id`, `do_location_id` and `pickup_hour` keep the dashboard filters fast.

---

## Custom Algorithm

`pipeline/algorithms.py` implements, without `heapq`, `sorted` or NumPy:

- **MinHeap**: array-backed binary heap (push / pop / replace in O(log n))
- **top_k**: the k largest items in O(n log k) time, O(k) space
- **quickselect**: k-th smallest value in O(n) average time
- **percentile / iqr_fences**: quartiles via quickselect, used to detect fare-per-mile outliers

Full pseudo-code and complexity analysis are in the separate PDF technical report.

---

## Team

| Name | Role |
|------|------|
| Elvis Mutangana | Data pipeline & database |
| Ezio Munyengango | Backend & frontend |
