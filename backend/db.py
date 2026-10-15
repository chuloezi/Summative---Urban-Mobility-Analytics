import os
import sqlite3

from flask import current_app, g

def get_db():
    # Reuse connection while app context is still active
    if "db" not in g:
        database_path = current_app.config["DATABASE"]
        if not os.path.exists(database_path):
            message = f"Database not found at {database_path}. Run pipeline/run_pipeline.py first."
            raise FileNotFoundError(message)

        # Reads data without changing the database
        database_uri = f"file:{database_path}?mode=ro"
        g.db = sqlite3.connect(database_uri, uri=True)
        g.db.row_factory = sqlite3.Row

    return g.db

def close_db(_exc=None):
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()

def query(sql, params=(), one=False):
    connection =get_db()
    cursor = connection.execute(sql, params)

    rows = []
    for row in cursor.fetchall():
        rows.append(dict(row))

    if one:
        if rows:
            return rows[0]
        return None

    return rows