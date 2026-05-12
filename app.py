import json
import os
import time
from pathlib import Path

from flask import Flask, Response, jsonify, render_template, send_from_directory

from parser import parse_document


BASE_DIR = Path(__file__).resolve().parent
USER_DIR = BASE_DIR / "user"
CONTENT_PATH = USER_DIR / "content.md"
TEMPLATE_PATH = USER_DIR / "template.html"
PAGE_CSS_PATH = USER_DIR / "page.css"
WATCHED_PATHS = (CONTENT_PATH, TEMPLATE_PATH, PAGE_CSS_PATH)

app = Flask(__name__)


def read_document():
    return parse_document(CONTENT_PATH.read_text(encoding="utf-8"))


def read_template():
    return TEMPLATE_PATH.read_text(encoding="utf-8")


def read_page_css():
    return PAGE_CSS_PATH.read_text(encoding="utf-8")


def file_version(path):
    try:
        stat = path.stat()
    except FileNotFoundError:
        return "missing"
    return f"{stat.st_mtime_ns}:{stat.st_size}"


def watched_paths():
    paths = list(WATCHED_PATHS)
    assets_dir = USER_DIR / "assets"
    if assets_dir.exists():
        paths.extend(path for path in assets_dir.rglob("*") if path.is_file())
    return sorted(set(paths))


def app_version():
    return "|".join(f"{path.relative_to(USER_DIR)}:{file_version(path)}" for path in watched_paths())


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/document")
def get_document():
    return jsonify(read_document())


@app.get("/api/template")
def get_template():
    return Response(read_template(), mimetype="text/html")


@app.get("/api/page-css")
def get_page_css():
    return Response(read_page_css(), mimetype="text/css")


@app.get("/user/assets/<path:filename>")
def user_asset(filename):
    return send_from_directory(USER_DIR / "assets", filename)


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


def main():
    host = os.environ.get("PAGEDJS_HOST", "127.0.0.1")
    port = int(os.environ.get("PAGEDJS_PORT", "5000"))
    debug = os.environ.get("PAGEDJS_DEBUG", "").lower() in {"1", "true", "yes"}
    app.run(host=host, port=port, debug=debug, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
