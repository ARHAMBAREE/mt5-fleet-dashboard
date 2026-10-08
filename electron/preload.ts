import { contextBridge, ipcRenderer } from "electron";
const version = process.argv.find(v => v.startsWith("--fleet-version="))?.split("=")[1] ?? "";
contextBridge.exposeInMainWorld("mt5fleet", {
  notify: (title: string, body: string) => ipcRenderer.send("fleet:notify", { title, body }),
  checkForUpdates: () => ipcRenderer.invoke("fleet:update"),
  setStartup: (enabled: boolean) => ipcRenderer.send("fleet:startup", enabled),
  setTray: (enabled: boolean) => ipcRenderer.send("fleet:tray", enabled),
  getVersion: () => version,
  configure: (url: string) => ipcRenderer.invoke("fleet:configure", url),
  reconnect: () => ipcRenderer.send("fleet:reconnect"),
});
