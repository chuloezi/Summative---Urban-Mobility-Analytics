"""Run the full pipeline: clean the raw NYC taxi files, then load them into SQLite.

Usage:
    python pipeline/run_pipeline.py [--sample N]
"""
import argparse
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from pipeline import clean, load  # noqa: E402
from pipeline.config import DB_PATH, PROCESSED_DIR, RAW_DIR, SCHEMA_PATH  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--raw-dir", default=RAW_DIR)
    parser.add_argument("--processed-dir", default=PROCESSED_DIR)
    parser.add_argument("--db", default=DB_PATH)
    parser.add_argument("--sample", type=int, default=None, help="randomly sample N raw trips")
    args = parser.parse_args()

    started = time.time()
    cleaned, zones, report = clean.run(args.raw_dir, args.processed_dir, args.sample)
    load.load(cleaned, zones, report, args.db, SCHEMA_PATH)
    print(f"Done in {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
