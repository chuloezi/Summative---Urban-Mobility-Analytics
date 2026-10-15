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
│   └── Database/
│       ├── schema.sql         # Database schema (tables + indexes)
│       └── insights.sql       # Queries behind the three findings below
├── backend/                   # Flask API
├── frontend/                  # Dashboard (HTML, CSS, JavaScript)
├── data/
│   ├── raw/                   # Raw TLC files go here (not committed, 687 MB)
│   └── processed/             # Cleaning report, excluded records, zone GeoJSON
├── database/mobility.db       # Ready-built SQLite database (200,000-trip sample)
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

### 3. Database (already included)

The repository ships a ready-built database, `database/mobility.db`, plus the cleaning outputs in `data/processed/`.
**You can skip straight to step 5.** Only follow step 4 if you want to rebuild everything from the raw files.

### 4. (Optional) Rebuild from the raw data

Download the three official NYC TLC files used in this project and place them in `data/raw/`:

| File | Description |
|------|-------------|
| `yellow_tripdata_2019-01.csv` | Trip records, January 2019 (fact table, 7.67M rows) |
| `taxi_zone_lookup.csv` | Zone ID → borough / zone / service zone (dimension table) |
| `taxi_zones.zip` | Zone boundary shapefile (spatial metadata) |

The pipeline also accepts the newer `.parquet` trip files and a `taxi_zones.geojson`.

```
data/raw/
├── yellow_tripdata_2019-01.csv
├── taxi_zone_lookup.csv
└── taxi_zones.zip
```

Then run:

```bash
python pipeline/run_pipeline.py --sample 200000
```

This takes about 1–2 minutes. The CSV is read in chunks and a uniform random sample of 200,000 trips (2.6% of the month) is kept, so it runs on a laptop with under 1 GB of free memory.
Omit `--sample` to process all 7.67M trips (needs several GB of RAM and produces a database of about 1.7 GB).

### 5. Start the backend

```bash
python backend/app.py
```

The API runs at `http://localhost:5000`.

### 6. Open the dashboard

With the backend running, open **http://localhost:5000** in your browser.
Flask serves the dashboard and the API from the same address, so do not open `index.html` directly from the file system.

---

## Dataset

**January 2019 NYC yellow taxi trips**: 7,667,792 raw records, of which a random sample of 200,000 is processed.

| Stage | Rows |
|-------|------|
| Sampled raw trips | 200,000 |
| Excluded (impossible records) | 2,288 (1.1%) |
| Kept in database | 197,712 |
| Kept but flagged as suspicious | 9,620 (4.9%) |

The most common exclusion was zero or negative distance (1,256 trips), followed by trips longer than 6 hours (549). Full counts are in `data/processed/cleaning_report.json`, and every excluded row is listed with its reason in `data/processed/excluded_records.csv`.

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

A summary of every rule and how many rows it affected is written to `data/processed/cleaning_report.json` and the `exclusion_log` table.

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
| `boroughs` | The NYC boroughs |
| `zones` | Taxi zones, linked to their borough |
| `vendors`, `rate_codes`, `payment_types` | Lookup tables for coded fields |
| `zone_stats` | Pre-computed pickups, dropoffs, revenue and averages per zone |
| `hourly_stats`, `daily_stats` | Pre-computed totals by weekday/hour and by day |
| `exclusion_log` | Every cleaning rule and how many rows it dropped or flagged |

Indexes on `pickup_date`, `pu_location_id`, `do_location_id` and `pickup_hour` keep the dashboard filters fast.

---

## Key Findings

All three findings come from the database above. The SQL for each is in [`pipeline/Database/insights.sql`](pipeline/Database/insights.sql).

1. **Daytime traffic roughly halves taxi speed.** Average trip speed falls from about 19 mph at 5 a.m. to roughly 10 mph between 8 a.m. and 6 p.m. In Manhattan, weekday rush-hour trips average 9.3–9.5 mph versus 16.2 mph between 2 and 5 a.m.
2. **Short trips are the most expensive per mile.** Trips under 1 mile cost on average $13.61 per mile, against $3.01 for trips over 10 miles. They are also very common: 61.8% of all trips are under 2 miles.
3. **Airport trips are a small share of rides but a large share of revenue.** Trips touching JFK, LaGuardia or Newark are 6.6% of rides but bring in 22.0% of revenue, with an average total of $51.46 against $12.84 for other trips.

---

## Custom Algorithm

`pipeline/algorithms.py` implements, without `heapq`, `sorted` or NumPy:

- **MinHeap**: array-backed binary heap (push / pop / replace in O(log n))
- **top_k**: the k largest items in O(n log k) time, O(k) space
- **quickselect**: k-th smallest value in O(n) average time
- **percentile / iqr_fences**: quartiles via quickselect, used to detect fare-per-mile outliers

`top_k` powers the dashboard's "Top zones" ranking and borough-to-borough flows (`/api/zones/top`, `/api/flows`).

Full pseudo-code and complexity analysis are in the separate PDF technical report.

---

## Team

| Name | Role |
|------|------|
| Elvis Mutangana | Data pipeline & database |
| Ezio Munyengango | Backend & frontend |
