"use strict";
const el = (id) => document.getElementById(id);
const nonce = location.hash.slice(1);
const pending = new Map();
let port,
  busy = false,
  apps = [];
function status(message, error = false) {
  el("status").textContent = message;
  el("status").classList.toggle("error", error);
}
function call(name, input = {}) {
  return new Promise((resolve, reject) => {
    if (!port)
      return reject(Error("Open Managed Apps from your Webdock project."));
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(Error("Request timed out. Refresh status before trying again."));
    }, 30000);
    pending.set(id, { resolve, reject, timeout });
    port.postMessage({ type: "action", id, name, input });
  });
}
function text(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}
function detail(label, value, hint) {
  const node = document.createElement("div");
  node.append(text("p", label, "detail-label"), text("p", value, "origin"));
  if (hint) node.append(text("p", hint, "hint"));
  return node;
}
function render() {
  el("apps").replaceChildren();
  el("empty").hidden = apps.length !== 0;
  el("refresh").disabled = busy;
  for (const app of apps) {
    const unavailable = app.status === "failed" || app.status === "deleted";
    const changing = !unavailable && app.revision !== app.observed_revision;
    const card = document.createElement("article");
    card.className = "app";
    const top = document.createElement("div");
    top.className = "app-top";
    const identity = document.createElement("div");
    identity.className = "identity";
    identity.append(
      text("h2", app.name),
      text("p", "Tabularium · Dedicated instance"),
    );
    const displayStatus = changing
      ? "Updating"
      : app.status.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
    top.append(
      text("span", "T", "icon"),
      identity,
      text(
        "span",
        displayStatus,
        "badge " + (changing ? "updating" : app.status),
      ),
    );
    const details = document.createElement("div");
    details.className = "details";
    details.append(
      detail(
        "App address",
        app.origin,
        "Open your app or Hosting using the links above this panel.",
      ),
      detail(
        "Operation",
        unavailable
          ? "Needs operator review"
          : changing
            ? "Change in progress"
            : "Ready for your next action",
        unavailable
          ? "Use Manage hosting above this panel to review this instance."
          : changing
            ? "Refresh status to check progress."
            : "Start, restart or stop this instance.",
      ),
    );
    const operation = document.createElement("div");
    operation.className = "operation";
    operation.append(
      text(
        "p",
        "Stopping keeps the app’s database and stored files.",
        "operation-copy",
      ),
    );
    const controls = document.createElement("div");
    controls.className = "controls";
    for (const action of ["start", "restart", "stop"]) {
      const button = text("button", action[0].toUpperCase() + action.slice(1));
      button.type = "button";
      button.setAttribute("aria-label", button.textContent + " " + app.name);
      button.disabled = busy || changing || unavailable;
      button.onclick = () => command(app, action);
      controls.append(button);
    }
    operation.append(controls);
    card.append(top, details, operation);
    el("apps").append(card);
  }
}
async function refresh() {
  if (busy) return;
  busy = true;
  render();
  try {
    const result = await call("apps.list");
    apps = result.apps;
    status(
      "Status refreshed. Only apps connected to this project appear here.",
    );
  } catch (error) {
    status(error.message || "Apps unavailable. Refresh to try again.", true);
  } finally {
    busy = false;
    render();
  }
}
async function command(app, operation) {
  if (busy) return;
  busy = true;
  render();
  status("Requesting " + operation + "…");
  try {
    await call("apps." + operation, {
      app_id: app.app_id,
      revision: app.revision,
      subscription_revision: app.subscription_revision,
    });
    const updated = await call("apps.get", { app_id: app.app_id });
    apps = apps.map((item) =>
      item.app_id === updated.app_id ? updated : item,
    );
    status(
      operation[0].toUpperCase() +
        operation.slice(1) +
        " requested. Refresh status to check progress.",
    );
  } catch (error) {
    status(
      error.message ||
        "Could not request the change. Refresh status and try again.",
      true,
    );
  } finally {
    busy = false;
    render();
  }
}
el("refresh").onclick = refresh;
window.addEventListener("message", (event) => {
  if (
    port ||
    event.source !== parent ||
    event.data?.type !== "webdock:init" ||
    !nonce ||
    event.data.nonce !== nonce ||
    event.ports.length !== 1
  )
    return;
  port = event.ports[0];
  port.onmessage = (event) => {
    const task = pending.get(event.data?.id);
    if (!task) return;
    clearTimeout(task.timeout);
    pending.delete(event.data.id);
    event.data.error
      ? task.reject(Error(String(event.data.error)))
      : task.resolve(event.data.result);
  };
  refresh();
});
setTimeout(() => {
  if (!port)
    status("Open Managed Apps from your Webdock project to connect.", true);
}, 10000);
