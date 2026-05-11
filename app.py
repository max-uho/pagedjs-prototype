import json
import time
from pathlib import Path

from flask import Flask, Response, jsonify, render_template

from parser import parse_document


BASE_DIR = Path(__file__).resolve().parent
USER_DIR = BASE_DIR / "user"
CONTENT_PATH = USER_DIR / "content.md"
TEMPLATE_PATH = USER_DIR / "template.html"
WATCHED_PATHS = (CONTENT_PATH, TEMPLATE_PATH)

app = Flask(__name__)


def read_document():
    return parse_document(CONTENT_PATH.read_text(encoding="utf-8"))


def read_template():
    return TEMPLATE_PATH.read_text(encoding="utf-8")


def file_version(path):
    try:
        stat = path.stat()
    except FileNotFoundError:
        return "missing"
    return f"{stat.st_mtime_ns}:{stat.st_size}"


def app_version():
    return "|".join(file_version(path) for path in WATCHED_PATHS)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/document")
def get_document():
    return jsonify(read_document())


@app.get("/api/template")
def get_template():
    return Response(read_template(), mimetype="text/html")


@app.get("/api/events")
def events():
    def stream():
        last_version = app_version()
        yield f"event: ready\ndata: {json.dumps({'version': last_version})}\n\n"

        while True:
            time.sleep(0.5)
            next_version = app_version()
            if next_version != last_version:
                last_version = next_version
                yield f"event: document\ndata: {json.dumps({'version': next_version})}\n\n"

    return Response(
        stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    app.run(debug=True, threaded=True)
