import { shellQuote } from "./serverHelpers.js";

export function injectServerLeasePrompt(
  html: string,
  reportDir: string,
): string {
  const restartCommand = `doublcov open ${shellQuote(reportDir)}`;
  const script = buildLeasePromptScript(restartCommand);
  return html.includes("</body>")
    ? html.replace("</body>", `${script}\n</body>`)
    : `${html}\n${script}`;
}

function buildLeasePromptScript(restartCommand: string): string {
  return `<script>
(() => {
  const restartCommand = ${jsonForHtmlScript(restartCommand)};
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:360px;padding:12px 14px;border:1px solid #334155;border-radius:8px;background:#111827;color:#e5e7eb;font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.35)";
  root.hidden = true;
  const text = document.createElement("div");
  const command = document.createElement("code");
  command.style.cssText = "display:block;margin-top:8px;padding:6px 8px;border-radius:6px;background:#020617;color:#bfdbfe;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-all";
  command.hidden = true;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Extend session";
  button.style.cssText = "margin-top:8px;padding:6px 10px;border:1px solid #60a5fa;border-radius:6px;background:#1d4ed8;color:white;font:inherit;cursor:pointer";
  root.append(text, command, button);
  document.addEventListener("DOMContentLoaded", () => document.body.append(root));

  const warningWindowMs = 10 * 60 * 1000;
  const format = (ms) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes > 0 ? minutes + "m " + String(seconds).padStart(2, "0") + "s" : seconds + "s";
  };
  const render = (status) => {
    if (!status || !status.timeoutMs) return;
    if (status.remainingMs > warningWindowMs) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    text.textContent = "Local report server stops in " + format(status.remainingMs) + ".";
  };
  const stopped = () => {
    root.hidden = false;
    text.textContent = "The local report server has stopped. Run doublcov open again to reload source data.";
    command.textContent = restartCommand;
    command.hidden = false;
    button.hidden = true;
  };
  const refresh = async () => {
    try {
      const response = await fetch("/__doublcov/status", { cache: "no-store" });
      if (!response.ok) throw new Error("status failed");
      render(await response.json());
    } catch {
      stopped();
    }
  };
  button.addEventListener("click", async () => {
    const response = await fetch("/__doublcov/extend", { method: "POST", cache: "no-store" });
    if (response.ok) render(await response.json());
  });
  if ("EventSource" in window) {
    const events = new EventSource("/__doublcov/events");
    events.addEventListener("shutdown", stopped);
    events.onerror = () => {
      events.close();
      stopped();
    };
  }
  refresh();
  setInterval(refresh, 5000);
})();
</script>`;
}

function jsonForHtmlScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}
