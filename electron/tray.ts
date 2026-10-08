import { Menu, Tray, BrowserWindow } from "electron";
export function createTray(window: BrowserWindow, icon: string, quit: () => void, updates: () => void) {
  const tray = new Tray(icon);
  tray.setToolTip("MT5 Fleet Dashboard");
  const show = () => { window.show(); window.focus(); };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open dashboard", click: show },
    { label: "Check for updates", click: updates },
    { type: "separator" }, { label: "Quit", click: quit },
  ]));
  tray.on("double-click", show);
  return tray;
}
