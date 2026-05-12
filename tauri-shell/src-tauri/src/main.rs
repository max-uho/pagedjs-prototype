#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    env,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use tauri::{
    menu::{Menu, MenuItem},
    Manager, RunEvent,
};

const HOST: &str = "127.0.0.1";

struct FlaskProcess {
    child: Arc<Mutex<Option<Child>>>,
}

impl Drop for FlaskProcess {
    fn drop(&mut self) {
        stop_child(&self.child);
    }
}

fn main() {
    let child = Arc::new(Mutex::new(None));
    let setup_child = Arc::clone(&child);
    let cleanup_child = Arc::clone(&child);

    tauri::Builder::default()
        .setup(move |app| {
            app.manage(FlaskProcess {
                child: Arc::clone(&setup_child),
            });

            let print = MenuItem::with_id(app, "print", "Print", true, Some("CmdOrCtrl+P"))?;
            let menu = Menu::with_items(app, &[&print])?;
            app.set_menu(menu)?;

            let (port, flask_child) = start_flask_with_retries()?;
            *setup_child.lock().expect("flask child lock poisoned") = Some(flask_child);

            let url = format!("http://{HOST}:{port}/");
            let window = app
                .get_webview_window("main")
                .expect("main window should exist");
            window.eval(&format!("window.location.replace('{url}')"))?;
            window.show()?;
            window.set_focus()?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "print" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval("window.print()");
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Tauri application")
        .run(move |_app_handle, event| {
            if matches!(event, RunEvent::Exit) {
                stop_child(&cleanup_child);
            }
        });
}

fn start_flask_with_retries() -> Result<(u16, Child), Box<dyn std::error::Error>> {
    let mut last_error = String::new();

    for _ in 0..10 {
        let port = free_port()?;
        let mut child = spawn_flask(port)?;

        match wait_for_health(port, &mut child) {
            Ok(()) => return Ok((port, child)),
            Err(error) => {
                last_error = error;
                stop_owned_child(child);
            }
        }
    }

    Err(format!("failed to start Flask server: {last_error}").into())
}

fn spawn_flask(port: u16) -> Result<Child, Box<dyn std::error::Error>> {
    let repo_root = repo_root();
    let python = python_interpreter(&repo_root);

    let child = Command::new(python)
        .arg("app.py")
        .current_dir(repo_root)
        .env("PAGEDJS_HOST", HOST)
        .env("PAGEDJS_PORT", port.to_string())
        .env("PAGEDJS_DEBUG", "0")
        .env("PYTHONUNBUFFERED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()?;

    Ok(child)
}

fn wait_for_health(port: u16, child: &mut Child) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut last_error = String::new();

    while Instant::now() < deadline {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("Flask exited early with status {status}"));
        }

        match request_health(port) {
            Ok(true) => return Ok(()),
            Ok(false) => last_error = "health check returned a non-200 response".to_string(),
            Err(error) => last_error = error,
        }

        thread::sleep(Duration::from_millis(150));
    }

    Err(format!("timed out waiting for /health: {last_error}"))
}

fn request_health(port: u16) -> Result<bool, String> {
    let mut stream = TcpStream::connect((HOST, port)).map_err(|error| error.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| error.to_string())?;

    let request = format!("GET /health HTTP/1.1\r\nHost: {HOST}:{port}\r\nConnection: close\r\n\r\n");
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;

    Ok(response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
}

fn free_port() -> Result<u16, Box<dyn std::error::Error>> {
    let listener = TcpListener::bind((HOST, 0))?;
    Ok(listener.local_addr()?.port())
}

fn repo_root() -> PathBuf {
    if let Ok(path) = env::var("PAGEDJS_REPO_ROOT") {
        return PathBuf::from(path);
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .expect("src-tauri should be nested under tauri-shell")
        .to_path_buf()
}

fn python_interpreter(repo_root: &PathBuf) -> PathBuf {
    if let Ok(path) = env::var("PAGEDJS_PYTHON") {
        return PathBuf::from(path);
    }

    let venv_python = if cfg!(windows) {
        repo_root.join(".venv").join("Scripts").join("python.exe")
    } else {
        repo_root.join(".venv").join("bin").join("python")
    };

    if venv_python.exists() {
        return venv_python;
    }

    if cfg!(windows) {
        PathBuf::from("python")
    } else {
        PathBuf::from("python3")
    }
}

fn stop_child(child: &Arc<Mutex<Option<Child>>>) {
    if let Some(child) = child.lock().expect("flask child lock poisoned").take() {
        stop_owned_child(child);
    }
}

fn stop_owned_child(mut child: Child) {
    if child.try_wait().ok().flatten().is_some() {
        return;
    }

    let _ = child.kill();
    let _ = child.wait();
}
