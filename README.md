# Paged.js Markdown Preview

This repo is a local Flask preview app with a small Tauri desktop shell. The desktop shell starts Flask on a free `127.0.0.1` port and loads the preview in a webview.

## Requirements

- Python 3.11 or newer
- Node.js and npm
- Rust and Cargo
- Tauri platform prerequisites for your OS

## Install On Another Machine

From the repo root:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd tauri-shell
npm install
```

The Tauri shell looks for Python in this order:

1. `PAGEDJS_PYTHON`
2. repo `.venv/bin/python`
3. `python3`

If your virtual environment is somewhere else, run Tauri with `PAGEDJS_PYTHON` set to that Python executable.

## Run The Web Preview

```sh
.venv/bin/python app.py
```

Then open `http://127.0.0.1:5000/`.

To use a different port:

```sh
PAGEDJS_PORT=5055 .venv/bin/python app.py
```

To preview a specific markdown file and open it in your browser:

```sh
.venv/bin/python app.py /path/to/document.md --open
```

You can combine this with host and port arguments:

```sh
.venv/bin/python app.py /path/to/document.md --host 127.0.0.1 --port 5055 --open
```

## Run The Tauri App In Development

```sh
cd tauri-shell
npm run dev
```

The app chooses a free local port, starts Flask, waits for `/health`, and loads the preview.

File menu shortcuts:

- `Cmd+O` on macOS, or `Ctrl+O` on other platforms, opens a markdown file in a new window.
- `Cmd+W` on macOS, or `Ctrl+W` on other platforms, closes the focused window.
- `Cmd+P` on macOS, or `Ctrl+P` on other platforms, opens the native print dialog for the focused window.
- `Cmd+Q` on macOS, or `Ctrl+Q` on other platforms, quits the app.

Each opened markdown file gets its own window and its own Flask preview process. The app watches the opened markdown file, the shared `user/template.html`, the shared `user/page.css`, and assets folders for changes.

Printing uses the focused macOS WebKit view and sets the paper size from `user/page.css` before showing the print dialog. It does not use Chromium.

## Build The Tauri App

```sh
cd tauri-shell
npm run build
```

Build output is written under `tauri-shell/src-tauri/target/release/bundle/`.

This first shell expects a usable Python environment on the machine. It does not bundle a standalone Python runtime into the app package yet.
