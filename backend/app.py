import os
import sys

app_file = os.path.abspath(__file__)
backend_folder = os.path.dirname(app_file)
ROOT = os.path.dirname(backend_folder)
sys.path.insert(0, ROOT)

from flask import Flask, jsonify, send_from_directory
from werkzeug.exceptions import HTTPException

from backend.db import close_db
from backend.routes import api

FRONTEND = os.path.join(ROOT, "frontend")


def create_app(database=None):
    app = Flask(__name__, static_folder=FRONTEND, static_url_path="")

    # use the supplied database
    default_database = os.path.join(ROOT, "database", "mobility.db")
    if database:
        database_path = database
    else:
        database_path = os.environ.get("MOBILITY_DB", default_database)

    app.config["DATABASE"] = database_path
    app.config["GEOJSON"] = os.path.join(ROOT, "data", "processed", "taxi_zones.geojson")
    app.config["REPORT"] = os.path.join(ROOT, "data", "processed", "cleaning_report.json")
    app.config["JSON_SORT_KEYS"] = False
    app.json.sort_keys = False

    # Add api routes and close database when app ends
    app.register_blueprint(api)
    app.teardown_appcontext(close_db)

    @app.get("/")
    def index():
        return send_from_directory(FRONTEND, "index.html")

    @app.errorhandler(HTTPException)
    def http_error(err):
        error_message = {"error": err.description}
        return jsonify(error_message), err.code

    @app.errorhandler(FileNotFoundError)
    def missing(err):
        error_message = {"error": str(err)}
        return jsonify(error_message), 503

    return app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug_enabled = os.environ.get("FLASK_DEBUG") == "1"
    server = create_app()
    server.run(host="0.0.0.0", port=port, debug=debug_enabled)