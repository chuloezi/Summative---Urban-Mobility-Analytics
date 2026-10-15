DROP TABLE IF EXISTS zone_stats;
DROP TABLE IF EXISTS hourly_stats;
DROP TABLE IF EXISTS daily_stats;
DROP TABLE IF EXISTS exclusion_log;
DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS zones;
DROP TABLE IF EXISTS boroughs;
DROP TABLE IF EXISTS payment_types;
DROP TABLE IF EXISTS rate_codes;
DROP TABLE IF EXISTS vendors;

CREATE TABLE vendors (
    vendor_id   INTEGER PRIMARY KEY,
    name        TEXT NOT NULL
);

CREATE TABLE rate_codes (
    rate_code_id INTEGER PRIMARY KEY,
    description  TEXT NOT NULL
);

CREATE TABLE payment_types (
    payment_type_id INTEGER PRIMARY KEY,
    description     TEXT NOT NULL
);

CREATE TABLE boroughs (
    borough_id INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE
);

CREATE TABLE zones (
    location_id  INTEGER PRIMARY KEY,
    borough_id   INTEGER NOT NULL REFERENCES boroughs (borough_id),
    zone         TEXT NOT NULL,
    service_zone TEXT NOT NULL
);

CREATE TABLE trips (
    trip_id               INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id             INTEGER REFERENCES vendors (vendor_id),
    pickup_datetime       TEXT NOT NULL,
    dropoff_datetime      TEXT NOT NULL,
    pickup_date           TEXT NOT NULL,
    passenger_count       INTEGER,
    trip_distance         REAL NOT NULL,
    rate_code_id          INTEGER REFERENCES rate_codes (rate_code_id),
    store_and_fwd_flag    INTEGER,
    pu_location_id        INTEGER NOT NULL REFERENCES zones (location_id),
    do_location_id        INTEGER NOT NULL REFERENCES zones (location_id),
    payment_type_id       INTEGER REFERENCES payment_types (payment_type_id),
    fare_amount           REAL,
    extra                 REAL,
    mta_tax               REAL,
    tip_amount            REAL,
    tolls_amount          REAL,
    improvement_surcharge REAL,
    total_amount          REAL,
    congestion_surcharge  REAL,
    airport_fee           REAL,
    trip_duration_min     REAL,
    avg_speed_mph         REAL,
    fare_per_mile         REAL,
    tip_pct               REAL,
    pickup_hour           INTEGER,
    day_of_week           INTEGER,
    is_weekend            INTEGER,
    time_of_day           TEXT,
    is_airport_trip       INTEGER,
    is_suspicious         INTEGER,
    suspicious_reason     TEXT
);

CREATE TABLE zone_stats (
    location_id       INTEGER PRIMARY KEY REFERENCES zones (location_id),
    pickups           INTEGER NOT NULL,
    dropoffs          INTEGER NOT NULL,
    revenue           REAL NOT NULL,
    avg_fare          REAL,
    avg_speed_mph     REAL,
    avg_fare_per_mile REAL,
    avg_tip_pct       REAL
);

CREATE TABLE hourly_stats (
    day_of_week   INTEGER NOT NULL,
    pickup_hour   INTEGER NOT NULL,
    trips         INTEGER NOT NULL,
    avg_speed_mph REAL,
    avg_fare      REAL,
    avg_tip_pct   REAL,
    PRIMARY KEY (day_of_week, pickup_hour)
);

CREATE TABLE daily_stats (
    pickup_date   TEXT PRIMARY KEY,
    trips         INTEGER NOT NULL,
    revenue       REAL NOT NULL,
    avg_fare      REAL,
    avg_speed_mph REAL
);

CREATE TABLE exclusion_log (
    rule_code    TEXT PRIMARY KEY,
    action       TEXT NOT NULL CHECK (action IN ('dropped', 'flagged')),
    description  TEXT NOT NULL,
    record_count INTEGER NOT NULL
);
