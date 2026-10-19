import os
from flask import Flask, send_from_directory
from flask_cors import CORS


def create_app():
    dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
    if os.path.exists(dist_dir):
        app = Flask(__name__, static_folder=dist_dir, static_url_path="")
    else:
        app = Flask(__name__)

    CORS(app)

    from .routes import bp
    app.register_blueprint(bp)

    from .ws import sock
    sock.init_app(app)

    if os.path.exists(dist_dir):
        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def serve_frontend(path):
            if path.startswith("api/"):
                return {"error": "Not Found"}, 404
            file_path = os.path.join(dist_dir, path)
            if path != "" and os.path.exists(file_path):
                return send_from_directory(dist_dir, path)
            return send_from_directory(dist_dir, "index.html")

    return app

