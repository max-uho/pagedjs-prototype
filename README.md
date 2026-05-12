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

## Run The Tauri App In Development

```sh
cd tauri-shell
npm run dev
```

The app chooses a free local port, starts Flask, waits for `/health`, and loads the preview. Press `Cmd+P` on macOS, or `Ctrl+P` on other platforms, to open the native print dialog.

## Build The Tauri App

```sh
cd tauri-shell
npm run build
```

Build output is written under `tauri-shell/src-tauri/target/release/bundle/`.

This first shell expects a usable Python environment on the machine. It does not bundle a standalone Python runtime into the app package yet.
