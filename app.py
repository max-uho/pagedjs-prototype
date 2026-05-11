import json
import time
from pathlib import Path

from flask import Flask, Response, jsonify, render_template, request


BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "document.json"

app = Flask(__name__)


def read_document():
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def write_document(document):
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = DATA_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    tmp_path.replace(DATA_PATH)


def document_version():
    try:
        stat = DATA_PATH.stat()
    except FileNotFoundError:
        return "missing"
    return f"{stat.st_mtime_ns}:{stat.st_size}"


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/document")
def get_document():
    return jsonify(read_document())


@app.put("/api/document")
def put_document():
    document = request.get_json(silent=True)
    if not isinstance(document, dict):
        return jsonify({"error": "Expected a JSON object."}), 400

    write_document(document)
    return jsonify({"ok": True, "version": document_version()})


@app.get("/api/events")
def events():
    def stream():
        last_version = document_version()
        yield f"event: ready\ndata: {json.dumps({'version': last_version})}\n\n"

        while True:
            time.sleep(0.5)
            next_version = document_version()
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
