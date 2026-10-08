import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";
let configured = false;
export function configureUpdates(url?: string) {
  if (!app.isPackaged || !url || new URL(url).protocol !== "https:") return;
  autoUpdater.setFeedURL({ provider: "generic", url });
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("error", err => { console.error("Update failed:", err.message); });
  autoUpdater.on("update-available", async info => {
    const answer = await dialog.showMessageBox({ type: "info", message: `Version ${info.version} is available. Download it?`, buttons: ["Later", "Download"], defaultId: 0 });
    if (answer.response === 1) await autoUpdater.downloadUpdate();
  });
  autoUpdater.on("update-downloaded", async () => {
    const answer = await dialog.showMessageBox({ message: "Update downloaded. Restart to install?", buttons: ["Later", "Restart"], defaultId: 0 });
    if (answer.response === 1) autoUpdater.quitAndInstall();
  });
  configured = true;
}
export async function checkForUpdates() {
  if (!configured) { await dialog.showMessageBox({ message: "Updates are not configured for this build. Install a release from your administrator." }); return; }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result?.updateInfo.version === app.getVersion()) await dialog.showMessageBox({ message: "You are using the latest version." });
  } catch { await dialog.showMessageBox({ type: "error", message: "Could not check for updates. Please try again later." }); }
}
