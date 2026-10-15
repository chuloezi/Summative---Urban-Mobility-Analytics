DROP TABLE IF EXISTS zone_stats;
DROP TABLE IF EXISTS cleaning_log;
DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS zones;
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

CREATE TABLE zones (
    location_id  INTEGER PRIMARY KEY,
    borough      TEXT NOT NULL,
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
    location_id INTEGER PRIMARY KEY REFERENCES zones (location_id),
    pickups     INTEGER NOT NULL,
    dropoffs    INTEGER NOT NULL,
    revenue     REAL NOT NULL
);

CREATE TABLE cleaning_log (
    rule_code     TEXT PRIMARY KEY,
    rule_type     TEXT NOT NULL CHECK (rule_type IN ('drop', 'flag')),
    description   TEXT NOT NULL,
    affected_rows INTEGER NOT NULL
);
