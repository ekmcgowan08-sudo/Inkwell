use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{Emitter, WindowEvent};

#[tauri::command]
fn platform_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![platform_name])
        .setup(|app| {
            // Native application menu: File / Edit / View / Window / Help.
            // Menu-item clicks are forwarded to the frontend as
            // "inkwell://menu" events (see apps/web/src/lib/desktopBridge.ts)
            // rather than driving app logic from Rust, since all real state
            // (which book is open, unsaved-work status) lives in the webview.
            let new_book = MenuItemBuilder::with_id("new_book", "New Book…").accelerator("CmdOrCtrl+N").build(app)?;
            let import = MenuItemBuilder::with_id("import", "Import Manuscript…").accelerator("CmdOrCtrl+O").build(app)?;
            let export = MenuItemBuilder::with_id("export", "Export…").accelerator("CmdOrCtrl+E").build(app)?;
            let command_palette = MenuItemBuilder::with_id("command_palette", "Command Palette…").accelerator("CmdOrCtrl+K").build(app)?;
            let focus_mode = MenuItemBuilder::with_id("focus_mode", "Toggle Focus Mode").accelerator("CmdOrCtrl+Shift+F").build(app)?;
            let find = MenuItemBuilder::with_id("find", "Find & Replace…").accelerator("CmdOrCtrl+F").build(app)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_book)
                .item(&import)
                .item(&export)
                .separator()
                .item(&PredefinedMenuItem::close_window(app, None)?)
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .separator()
                .item(&find)
                .build()?;

            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&focus_mode)
                .item(&command_palette)
                .separator()
                .item(&PredefinedMenuItem::fullscreen(app, None)?)
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .item(&PredefinedMenuItem::minimize(app, None)?)
                .item(&PredefinedMenuItem::maximize(app, None)?)
                .build()?;

            let about = PredefinedMenuItem::about(
                app,
                None,
                Some(AboutMetadataBuilder::new().name(Some("Inkwell")).build()),
            )?;
            let help_menu = SubmenuBuilder::new(app, "Help").item(&about).build()?;

            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&window_menu)
                .item(&help_menu)
                .build()?;
            app.set_menu(menu)?;

            let app_handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                let _ = app_handle.emit("inkwell://menu", event.id().0.clone());
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Prevent-accidental-close guard: ask the frontend whether it's
            // safe to close (unsaved/unsynced writes) before actually
            // closing. The frontend answers by calling `window.close()`
            // itself once it has confirmed — see
            // apps/web/src/lib/desktopBridge.ts `registerCloseGuard`.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("inkwell://close-requested", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Inkwell desktop");
}
