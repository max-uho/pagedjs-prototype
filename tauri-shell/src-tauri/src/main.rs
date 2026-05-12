#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashMap,
    env,
    ffi::OsStr,
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

const HOST: &str = "127.0.0.1";
const DEFAULT_MARKDOWN_NAME: &str = "content.md";

#[derive(Default)]
struct AppState {
    sessions: Mutex<HashMap<String, WindowSession>>,
    focused_window: Mutex<Option<String>>,
    next_window_id: Mutex<u64>,
}

struct WindowSession {
    child: Child,
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(Arc::new(AppState::default()));
            app.set_menu(build_menu(app.handle())?)?;
            open_preview_in_existing_window(app.handle(), "main", None)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => open_markdown_file(app),
            "close" => close_focused_window(app),
            "print" => print_focused_window(app),
            "quit" => quit_app(app),
            _ => {}
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Focused(true)) {
                remember_focused_window(window.app_handle(), window.label());
            }

            if matches!(event, WindowEvent::Destroyed) {
                stop_window_process(window.app_handle(), window.label());
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Tauri application")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::Exit) {
                stop_all_processes(app_handle);
            }
        });
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", "Open...", true, Some("CmdOrCtrl+O"))?;
    let close = MenuItem::with_id(app, "close", "Close Window", true, Some("CmdOrCtrl+W"))?;
    let print = MenuItem::with_id(app, "print", "Print...", true, Some("CmdOrCtrl+P"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, Some("CmdOrCtrl+Q"))?;
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &open,
            &close,
            &PredefinedMenuItem::separator(app)?,
            &print,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    Menu::with_items(app, &[&file])
}

fn open_markdown_file(app: &AppHandle) {
    let Some(path) = rfd::FileDialog::new()
        .set_title("Open Markdown File")
        .add_filter("Markdown", &["md", "markdown"])
        .pick_file()
    else {
        return;
    };

    if let Err(error) = open_preview_in_new_window(app, path) {
        eprintln!("failed to open markdown file: {error}");
    }
}

fn print_focused_window(app: &AppHandle) {
    let Some(label) = focused_window_label(app) else {
        return;
    };

    let Some(webview) = app.get_webview_window(&label) else {
        return;
    };

    let page_size = page_size_from_css();
    if let Err(error) = print_webview(&webview, page_size) {
        eprintln!("failed to print focused window: {error}");
    }
}

fn close_focused_window(app: &AppHandle) {
    let state = app.state::<Arc<AppState>>();
    let label = state
        .focused_window
        .lock()
        .expect("focused window lock poisoned")
        .clone()
        .unwrap_or_else(|| "main".to_string());

    let Some(webview) = app.get_webview_window(&label) else {
        return;
    };

    if let Err(error) = webview.close() {
        eprintln!("failed to close focused window: {error}");
    }
}

fn quit_app(app: &AppHandle) {
    stop_all_processes(app);
    app.exit(0);
}

fn open_preview_in_existing_window(
    app: &AppHandle,
    label: &str,
    markdown_path: Option<PathBuf>,
) -> Result<(), Box<dyn std::error::Error>> {
    let (port, child) = start_flask_with_retries(markdown_path.as_deref())?;
    store_session(app, label.to_string(), child);

    let url = format!("http://{HOST}:{port}/");
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window {label} does not exist"))?;

    window.eval(&format!("window.location.replace('{url}')"))?;
    configure_window(&window, markdown_path.as_deref());
    window.show()?;
    window.set_focus()?;
    remember_focused_window(app, label);

    Ok(())
}

fn open_preview_in_new_window(
    app: &AppHandle,
    markdown_path: PathBuf,
) -> Result<(), Box<dyn std::error::Error>> {
    let label = next_window_label(app);
    let (port, child) = start_flask_with_retries(Some(&markdown_path))?;
    let url = format!("http://{HOST}:{port}/");

    let window = WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::External(url.parse()?))
        .title(window_title(Some(&markdown_path)))
        .inner_size(1200.0, 900.0)
        .build()?;

    store_session(app, label, child);
    window.set_focus()?;
    remember_focused_window(app, window.label());

    Ok(())
}

fn remember_focused_window(app: &AppHandle, label: &str) {
    let state = app.state::<Arc<AppState>>();
    *state
        .focused_window
        .lock()
        .expect("focused window lock poisoned") = Some(label.to_string());
}

fn configure_window(window: &WebviewWindow, markdown_path: Option<&Path>) {
    let _ = window.set_title(&window_title(markdown_path));
}

fn window_title(markdown_path: Option<&Path>) -> String {
    match markdown_path
        .and_then(Path::file_name)
        .and_then(OsStr::to_str)
    {
        Some(file_name) => format!("{file_name} - Paged.js Markdown Preview"),
        None => format!("{DEFAULT_MARKDOWN_NAME} - Paged.js Markdown Preview"),
    }
}

fn next_window_label(app: &AppHandle) -> String {
    let state = app.state::<Arc<AppState>>();
    let mut next = state
        .next_window_id
        .lock()
        .expect("window id lock poisoned");
    *next += 1;
    format!("document-{}", *next)
}

fn store_session(app: &AppHandle, label: String, child: Child) {
    let state = app.state::<Arc<AppState>>();
    let mut sessions = state.sessions.lock().expect("session map lock poisoned");
    if let Some(previous) = sessions.insert(label, WindowSession { child }) {
        stop_owned_child(previous.child);
    }
}

fn stop_window_process(app: &AppHandle, label: &str) {
    let state = app.state::<Arc<AppState>>();
    let session = state
        .sessions
        .lock()
        .expect("session map lock poisoned")
        .remove(label);

    if let Some(session) = session {
        stop_owned_child(session.child);
    }
}

fn stop_all_processes(app: &AppHandle) {
    let state = app.state::<Arc<AppState>>();
    let children = state
        .sessions
        .lock()
        .expect("session map lock poisoned")
        .drain()
        .map(|(_, session)| session.child)
        .collect::<Vec<_>>();

    for child in children {
        stop_owned_child(child);
    }
}

fn focused_window_label(app: &AppHandle) -> Option<String> {
    let state = app.state::<Arc<AppState>>();
    let label = state
        .focused_window
        .lock()
        .expect("focused window lock poisoned")
        .clone()
        .unwrap_or_else(|| "main".to_string());
    Some(label)
}

fn page_size_from_css() -> PageSize {
    let css_path = repo_root().join("user").join("page.css");
    let Ok(css) = fs::read_to_string(css_path) else {
        return PageSize::a5();
    };
    parse_page_size(&css).unwrap_or_else(PageSize::a5)
}

#[derive(Clone, Copy)]
struct PageSize {
    width_points: f64,
    height_points: f64,
}

impl PageSize {
    fn a5() -> Self {
        Self {
            width_points: mm_to_points(148.0),
            height_points: mm_to_points(210.0),
        }
    }
}

fn parse_page_size(css: &str) -> Option<PageSize> {
    let normalized = css.replace('\n', " ");
    let size_value = normalized
        .split(';')
        .find_map(|part| part.split_once("size:").map(|(_, value)| value.trim()))?;
    let tokens = size_value.split_whitespace().collect::<Vec<_>>();

    match tokens.as_slice() {
        ["A5"] => Some(PageSize::a5()),
        ["A4"] => Some(PageSize {
            width_points: mm_to_points(210.0),
            height_points: mm_to_points(297.0),
        }),
        ["Letter"] => Some(PageSize {
            width_points: 612.0,
            height_points: 792.0,
        }),
        [width, height, ..] => Some(PageSize {
            width_points: css_length_to_points(width)?,
            height_points: css_length_to_points(height)?,
        }),
        _ => None,
    }
}

fn css_length_to_points(value: &str) -> Option<f64> {
    let number = value
        .trim_end_matches(|character: char| character.is_ascii_alphabetic())
        .parse::<f64>()
        .ok()?;

    if value.ends_with("mm") {
        Some(mm_to_points(number))
    } else if value.ends_with("cm") {
        Some(mm_to_points(number * 10.0))
    } else if value.ends_with("in") {
        Some(number * 72.0)
    } else if value.ends_with("pt") {
        Some(number)
    } else {
        None
    }
}

fn mm_to_points(mm: f64) -> f64 {
    mm * 72.0 / 25.4
}

fn print_webview(webview: &WebviewWindow, page_size: PageSize) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return print_wkwebview(webview, page_size);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = page_size;
        webview.print().map_err(|error| error.to_string())
    }
}

#[cfg(target_os = "macos")]
fn print_wkwebview(webview: &WebviewWindow, page_size: PageSize) -> Result<(), String> {
    webview
        .with_webview(move |platform_webview| unsafe {
            run_wkwebview_print_operation(platform_webview, page_size);
        })
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
unsafe fn run_wkwebview_print_operation(
    platform_webview: tauri::webview::PlatformWebview,
    page_size: PageSize,
) {
    use objc2_app_kit::{NSPrintInfo, NSPrintOperation};
    use objc2_foundation::NSSize;
    use objc2_web_kit::WKWebView;

    let view: &WKWebView = &*platform_webview.inner().cast();
    let print_info = NSPrintInfo::new();
    print_info.setPaperSize(NSSize::new(page_size.width_points, page_size.height_points));
    print_info.setTopMargin(0.0);
    print_info.setRightMargin(0.0);
    print_info.setBottomMargin(0.0);
    print_info.setLeftMargin(0.0);

    let print_operation: objc2::rc::Retained<NSPrintOperation> =
        view.printOperationWithPrintInfo(&print_info);
    print_operation.setShowsPrintPanel(true);
    print_operation.setShowsProgressPanel(true);
    print_operation.runOperation();
}

fn start_flask_with_retries(
    markdown_path: Option<&Path>,
) -> Result<(u16, Child), Box<dyn std::error::Error>> {
    let mut last_error = String::new();

    for _ in 0..10 {
        let port = free_port()?;
        let mut child = spawn_flask(port, markdown_path)?;

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

fn spawn_flask(
    port: u16,
    markdown_path: Option<&Path>,
) -> Result<Child, Box<dyn std::error::Error>> {
    let repo_root = repo_root();
    let python = python_interpreter(&repo_root);

    let mut command = Command::new(python);
    command
        .arg("app.py")
        .current_dir(repo_root)
        .env("PAGEDJS_HOST", HOST)
        .env("PAGEDJS_PORT", port.to_string())
        .env("PAGEDJS_DEBUG", "0")
        .env("PYTHONUNBUFFERED", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    if let Some(path) = markdown_path {
        command.env("PAGEDJS_CONTENT_PATH", path);
    }

    Ok(command.spawn()?)
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

    let request =
        format!("GET /health HTTP/1.1\r\nHost: {HOST}:{port}\r\nConnection: close\r\n\r\n");
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
        .and_then(Path::parent)
        .expect("src-tauri should be nested under tauri-shell")
        .to_path_buf()
}

fn python_interpreter(repo_root: &Path) -> PathBuf {
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

fn stop_owned_child(mut child: Child) {
    if child.try_wait().ok().flatten().is_some() {
        return;
    }

    let _ = child.kill();
    let _ = child.wait();
}
