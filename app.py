import argparse
import json
import os
import webbrowser
import time
from pathlib import Path

from flask import Flask, Response, jsonify, render_template, send_from_directory

from parser import parse_document


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_USER_DIR = BASE_DIR / "user"
CONTENT_PATH = Path(os.environ.get("PAGEDJS_CONTENT_PATH", DEFAULT_USER_DIR / "content.md")).resolve()
TEMPLATE_PATH = Path(os.environ.get("PAGEDJS_TEMPLATE_PATH", DEFAULT_USER_DIR / "template.html")).resolve()
PAGE_CSS_PATH = Path(os.environ.get("PAGEDJS_PAGE_CSS_PATH", DEFAULT_USER_DIR / "page.css")).resolve()
WATCHED_PATHS = (CONTENT_PATH, TEMPLATE_PATH, PAGE_CSS_PATH)

app = Flask(__name__)


def read_document():
    document = parse_document(CONTENT_PATH.read_text(encoding="utf-8"))
    document["sourceName"] = CONTENT_PATH.name
    document["sourcePath"] = str(CONTENT_PATH)
    return document


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
    for assets_dir in asset_dirs():
        if assets_dir.exists():
            paths.extend(path for path in assets_dir.rglob("*") if path.is_file())
    return sorted(set(paths))


def app_version():
    return "|".join(f"{path}:{file_version(path)}" for path in watched_paths())


def asset_dirs():
    dirs = [DEFAULT_USER_DIR / "assets"]
    content_assets = CONTENT_PATH.parent / "assets"
    if content_assets not in dirs:
        dirs.insert(0, content_assets)
    return dirs


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
    for assets_dir in asset_dirs():
        if (assets_dir / filename).is_file():
            return send_from_directory(assets_dir, filename)
    return send_from_directory(DEFAULT_USER_DIR / "assets", filename)


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
    global CONTENT_PATH, WATCHED_PATHS

    parser = argparse.ArgumentParser(description="Run the Paged.js markdown preview server.")
    parser.add_argument("file", nargs="?", help="Optional markdown file to preview.")
    parser.add_argument("--host", default=os.environ.get("PAGEDJS_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PAGEDJS_PORT", "5000")))
    parser.add_argument("--open", action="store_true", help="Open the preview in the default browser.")
    parser.add_argument("--debug", action="store_true", help="Run Flask in debug mode.")
    args = parser.parse_args()

    if args.file:
        CONTENT_PATH = Path(args.file).expanduser().resolve()
        WATCHED_PATHS = (CONTENT_PATH, TEMPLATE_PATH, PAGE_CSS_PATH)

    debug = args.debug or os.environ.get("PAGEDJS_DEBUG", "").lower() in {"1", "true", "yes"}
    if args.open:
        webbrowser.open(f"http://{args.host}:{args.port}/")
    app.run(host=args.host, port=args.port, debug=debug, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
