use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{App, Wry};

pub const MENU_OPEN: &str = "open";
pub const MENU_CLOSE_TAB: &str = "close-tab";
pub const MENU_CLOSE_WINDOW: &str = "close-window";
pub const MENU_INSTALL_CLI: &str = "install-cli";
pub const MENU_RELOAD: &str = "reload";
pub const MENU_FORCE_RELOAD: &str = "force-reload";
pub const MENU_TOGGLE_DEVTOOLS: &str = "toggle-devtools";

/// Menu items with this prefix are handled by the renderer; the rest of the id is the command name.
pub const RENDERER_COMMAND_PREFIX: &str = "renderer:";

fn renderer_item(
    app: &App,
    command: &str,
    label: &str,
    accelerator: &str,
) -> tauri::Result<tauri::menu::MenuItem<Wry>> {
    MenuItemBuilder::with_id(format!("{RENDERER_COMMAND_PREFIX}{command}"), label)
        .accelerator(accelerator)
        .build(app)
}

pub fn build_menu(app: &App) -> tauri::Result<Menu<Wry>> {
    let check_updates = MenuItemBuilder::with_id(
        format!("{RENDERER_COMMAND_PREFIX}check-updates"),
        "Check for Updates…",
    )
    .build(app)?;
    let install_cli =
        MenuItemBuilder::with_id(MENU_INSTALL_CLI, "Install CLI Command…").build(app)?;
    let app_menu = SubmenuBuilder::new(app, "LiveMark")
        .about(None)
        .separator()
        .item(&check_updates)
        .item(&install_cli)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let open = MenuItemBuilder::with_id(MENU_OPEN, "Open…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let close_tab = MenuItemBuilder::with_id(MENU_CLOSE_TAB, "Close Tab")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;
    let close_window = MenuItemBuilder::with_id(MENU_CLOSE_WINDOW, "Close Window")
        .accelerator("CmdOrCtrl+Shift+W")
        .build(app)?;
    let go_to_file = renderer_item(app, "go-to-file", "Go to File…", "CmdOrCtrl+P")?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&open)
        .item(&go_to_file)
        .separator()
        .item(&close_tab)
        .item(&close_window)
        .build()?;

    let find = renderer_item(app, "find", "Find…", "CmdOrCtrl+F")?;
    let select_all = renderer_item(app, "select-all", "Select All", "CmdOrCtrl+A")?;
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .copy()
        .item(&select_all)
        .separator()
        .item(&find)
        .build()?;

    let reload = MenuItemBuilder::with_id(MENU_RELOAD, "Reload")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;
    let force_reload = MenuItemBuilder::with_id(MENU_FORCE_RELOAD, "Force Reload")
        .accelerator("CmdOrCtrl+Shift+R")
        .build(app)?;
    let devtools = MenuItemBuilder::with_id(MENU_TOGGLE_DEVTOOLS, "Toggle Developer Tools")
        .accelerator("Alt+CmdOrCtrl+I")
        .build(app)?;
    let reset_zoom = renderer_item(app, "text-zoom-reset", "Actual Size", "CmdOrCtrl+0")?;
    let zoom_in = renderer_item(app, "text-zoom-in", "Make Text Bigger", "CmdOrCtrl+=")?;
    let zoom_out = renderer_item(app, "text-zoom-out", "Make Text Smaller", "CmdOrCtrl+-")?;
    let toggle_pause = renderer_item(app, "toggle-pause", "Pause Live Reload", "CmdOrCtrl+Shift+P")?;
    let next_change = renderer_item(app, "next-change", "Jump to Next Change", "CmdOrCtrl+Shift+N")?;
    let toggle_split = renderer_item(app, "toggle-split", "Split View", "CmdOrCtrl+\\")?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&toggle_pause)
        .item(&next_change)
        .item(&toggle_split)
        .separator()
        .item(&reload)
        .item(&force_reload)
        .item(&devtools)
        .separator()
        .item(&reset_zoom)
        .item(&zoom_in)
        .item(&zoom_out)
        .separator()
        .fullscreen()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .bring_all_to_front()
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
        .build()
}
