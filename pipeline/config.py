"""Shared paths and settings for the pipeline."""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

RAW_DIR = os.path.join(ROOT, "data", "raw")
PROCESSED_DIR = os.path.join(ROOT, "data", "processed")
DB_PATH = os.path.join(ROOT, "database", "mobility.db")
SCHEMA_PATH = os.path.join(ROOT, "pipeline", "Database", "schema.sql")

CHUNK_SIZE = 50_000
