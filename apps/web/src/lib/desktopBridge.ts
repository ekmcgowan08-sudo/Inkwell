/**
 * Optional Tauri integration. `apps/web` must keep working as a plain
 * browser/PWA build (per docs/ARCHITECTURE.md), so every Tauri API call
 * here is behind an `isTauri()` runtime check and a dynamic import — in a
 * normal browser this module does nothing and never touches `@tauri-apps/*`.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Prevents the window from closing while there's unrecovered/unsynced work,
 * asking the author to confirm first — see docs/EDITOR_AND_AUTOSAVE.md
 * "Prevention of accidental window closure." `hasPendingWork` should return
 * true whenever the sync queue is non-empty or an autosave is in flight.
 */
export async function registerCloseGuard(hasPendingWork: () => boolean): Promise<() => void> {
  if (!isTauri()) return () => {};

  const [{ getCurrentWindow }, { listen }, { confirm }] = await Promise.all([
    import("@tauri-apps/api/window"),
    import("@tauri-apps/api/event"),
    import("@tauri-apps/plugin-dialog"),
  ]);

  const appWindow = getCurrentWindow();
  const unlisten = await listen("inkwell://close-requested", async () => {
    if (!hasPendingWork()) {
      await appWindow.destroy();
      return;
    }
    const shouldClose = await confirm("Some changes may not have finished saving. Close Inkwell anyway?", { title: "Unsaved work", kind: "warning" });
    if (shouldClose) await appWindow.destroy();
  });

  return unlisten;
}

export type MenuAction = "new_book" | "import" | "export" | "command_palette" | "focus_mode" | "find";

/** Forwards native menu clicks (see src-tauri/src/lib.rs) as DOM CustomEvents the relevant page listens for. */
export async function registerMenuBridge(): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<string>("inkwell://menu", (event) => {
    window.dispatchEvent(new CustomEvent<MenuAction>("inkwell-menu-action", { detail: event.payload as MenuAction }));
  });
  return unlisten;
}
