import { Notification, BrowserWindow } from "electron";
export function notify(window: BrowserWindow, title: unknown, body: unknown) {
  if (typeof title !== "string" || typeof body !== "string" || !Notification.isSupported()) return;
  const notification = new Notification({ title: title.slice(0, 120), body: body.slice(0, 1000) });
  notification.on("click", () => { window.show(); window.focus(); });
  notification.show();
}
