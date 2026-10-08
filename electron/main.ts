import { app, BrowserWindow, ipcMain, session, shell, Tray } from "electron";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createTray } from "./tray";
import { notify } from "./notifications";
import { checkForUpdates, configureUpdates } from "./updater";

interface Config { url?: string; minimizeToTray?: boolean; startOnBoot?: boolean; updateUrl?: string }
let config: Config = {};
let window: BrowserWindow;
let tray: Tray | undefined;
let quitting = false;
let retry: ReturnType<typeof setTimeout> | undefined;
let attempts = 0;
const assetDir = app.isPackaged ? join(process.resourcesPath, "desktop") : join(__dirname, "../../electron/assets");
const iconDir = app.isPackaged ? join(process.resourcesPath, "icons") : join(__dirname, "../../public/icons");
const setupUrl = pathToFileURL(join(assetDir, "setup.html")).href;
const offlineUrl = pathToFileURL(join(assetDir, "offline.html")).href;
const configFile = () => join(app.getPath("userData"), "settings.json");
function save() { writeFileSync(configFile(), JSON.stringify(config), { mode: 0o600 }); }
function origin(input: string) {
  const url = new URL(input);
  if (url.username || url.password || (url.protocol !== "https:" && !( !app.isPackaged && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Use an HTTPS dashboard URL");
  return url.origin;
}
function allowed(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent, local = false) {
  const frame = event.senderFrame;
  return event.sender === window.webContents && frame === window.webContents.mainFrame &&
    (local ? frame?.url === setupUrl || frame?.url === offlineUrl : !!config.url && frame?.url.startsWith(config.url + "/"));
}
async function connect() {
  if (retry) clearTimeout(retry);
  if (!config.url) { await window.loadFile(join(assetDir, "setup.html")); return; }
  try { await window.loadURL(config.url + "/dashboard"); attempts = 0; }
  catch {
    if (quitting || window.isDestroyed()) return;
    await window.loadFile(join(assetDir, "offline.html"));
    retry = setTimeout(() => void connect(), Math.min(30_000, 1000 * 2 ** attempts++));
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { window?.show(); window?.focus(); });
  app.on("before-quit", () => { quitting = true; if (retry) clearTimeout(retry); });
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(async () => {
    app.setAppUserModelId("com.mt5fleet.dashboard");
    const bundled = join(assetDir, "config.json");
    if (existsSync(bundled)) config = JSON.parse(readFileSync(bundled, "utf8"));
    if (existsSync(configFile())) { try { config = { ...config, ...JSON.parse(readFileSync(configFile(), "utf8")) }; } catch {} }
    const override = !app.isPackaged ? process.env.ELECTRON_APP_URL || "http://localhost:3000" : config.url;
    try { config.url = override ? origin(override) : undefined; } catch { config.url = undefined; }
    configureUpdates(config.updateUrl);
    const isolated = session.fromPartition("persist:mt5fleet");
    isolated.setPermissionRequestHandler((contents, permission, callback) => callback(contents === window?.webContents && permission === "notifications" && !!config.url && contents.getURL().startsWith(config.url + "/")));
    window = new BrowserWindow({ width: 1440, height: 940, minWidth: 380, minHeight: 600, show: false,
      title: "MT5 Fleet Dashboard", backgroundColor: "#0a0e16", icon: join(iconDir, "icon-512.png"),
      webPreferences: { preload: join(__dirname, "preload.js"), session: isolated, nodeIntegration: false,
        contextIsolation: true, sandbox: true, webSecurity: true, additionalArguments: [`--fleet-version=${app.getVersion()}`] } });
    window.removeMenu();
    window.once("ready-to-show", () => window.show());
    const permitted = (url: string) => url === setupUrl || url === offlineUrl || (!!config.url && url.startsWith(config.url + "/"));
    window.webContents.on("will-navigate", (e, url) => { if (!permitted(url)) e.preventDefault(); });
    window.webContents.on("will-redirect", (e, url) => { if (!permitted(url)) e.preventDefault(); });
    window.webContents.on("will-attach-webview", e => e.preventDefault());
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (config.url && url.startsWith(config.url + "/api/export?")) window.webContents.downloadURL(url);
      else { try { if (["https:", "http:"].includes(new URL(url).protocol)) void shell.openExternal(url); } catch {} }
      return { action: "deny" };
    });
    window.on("close", e => { if (!quitting && config.minimizeToTray !== false && tray) { e.preventDefault(); window.hide(); } });
    window.on("minimize", () => { if (config.minimizeToTray !== false && tray) window.hide(); });
    try { tray = createTray(window, join(iconDir, "icon-32.png"), () => app.quit(), () => void checkForUpdates()); } catch { config.minimizeToTray = false; }
    ipcMain.on("fleet:notify", (e, data) => { if (allowed(e) && data) notify(window, data.title, data.body); });
    ipcMain.on("fleet:tray", (e, enabled) => { if (allowed(e) && typeof enabled === "boolean") { config.minimizeToTray = enabled; save(); } });
    ipcMain.on("fleet:startup", (e, enabled) => { if (allowed(e) && typeof enabled === "boolean" && ["win32", "darwin"].includes(process.platform)) { app.setLoginItemSettings({ openAtLogin: enabled }); config.startOnBoot = enabled; save(); } });
    ipcMain.handle("fleet:update", e => { if (allowed(e)) return checkForUpdates(); });
    ipcMain.handle("fleet:configure", async (e, value) => {
      if (!allowed(e, true) || typeof value !== "string") return { error: "Forbidden" };
      try { config.url = origin(value); save(); void connect(); return { ok: true }; }
      catch { return { error: "Enter a valid HTTPS dashboard URL" }; }
    });
    ipcMain.on("fleet:reconnect", e => { if (allowed(e, true)) void connect(); });
    app.on("activate", () => { window.show(); });
    await connect();
  });
}
