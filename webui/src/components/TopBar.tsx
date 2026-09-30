import { useRef } from "react";
import { useDirector } from "../lib/store";
import { request } from "../lib/bridge";
import { flushNow } from "../lib/persist";
import { readSessionFile } from "../lib/session";

const H3D2_BUILD = "1.6.21";

function browserBase(): string {
  const origin = (window.location && window.location.origin) || "";
  return origin && origin !== "null" ? origin : "";
}

/** Upload a browser-selected file through Gradio and return its server-side temp path. */
async function uploadBrowserFile(file: File): Promise<string> {
  let lastError = "Gradio upload endpoint did not respond";
  for (const ep of ["/gradio_api/upload", "/upload"]) {
    try {
      const fd = new FormData();
      fd.append("files", file, file.name);
      const res = await fetch(browserBase() + ep, { method: "POST", body: fd });
      if (!res.ok) {
        lastError = `${ep} returned HTTP ${res.status}`;
        continue;
      }
      const paths = await res.json();
      const serverPath = Array.isArray(paths) ? paths[0] : paths;
      if (typeof serverPath === "string" && serverPath) return serverPath;
      lastError = `${ep} returned no file path`;
    } catch (e) {
      lastError = String(e);
    }
  }
  throw new Error(lastError);
}

function serverParent(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (i <= 0) throw new Error(`Could not determine the server upload directory from ${path}`);
  return path.slice(0, i);
}

function serverFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || "h3-director-project.zip";
}

/** Start a download on the browser/device that is actually viewing Wan2GP. */
function downloadServerFile(path: string, suggestedName?: string): void {
  const a = document.createElement("a");
  a.href = `${browserBase()}/gradio_api/file=${encodeURIComponent(path)}`;
  a.download = suggestedName || serverFileName(path);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Gradio already grants browser uploads a server temp directory. Uploading a
 * tiny marker gives us a safe temporary folder that the browser can also read
 * back through Gradio's file route. The existing Python save_project_zip code
 * can therefore stay unchanged.
 */
async function browserSaveDirectory(): Promise<string> {
  const marker = new File(
    [`H3 Director browser save target ${Date.now()}\n`],
    `.h3director-save-${Date.now()}.tmp`,
    { type: "application/octet-stream" },
  );
  return serverParent(await uploadBrowserFile(marker));
}

export function TopBar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const s = useDirector();
  const chip = `${s.pipeline} · ${s.size.replace("Full ", "").replace("Pruned ", "Pruned ")} · AdaLN${s.builder.startBlock}–${s.builder.endBlock} · ${String(s.advanced.resolution).replace("x", "×")}`;

  return (
    <header className="top">
      <div className="mark">
        MiniMax H3 <span>Director</span>
      </div>
      <div className="chipf">
        <span className={s.dirty ? "dot warn" : "dot"} />
        <b>{s.project_name}</b>
        {s.loadBlocked ? (
          <span className="pill w" data-testid="not-saving"
            title="Your project has not loaded from Wan2GP yet. Until it does, nothing is saved, so what is on screen cannot overwrite it.">
            NOT SAVING · project not loaded yet ({s.loadBlocked})
          </span>
        ) : (
          <span style={{ color: "var(--ink3)" }}>{s.savedAt ? `saved ${s.savedAt}` : s.dirty ? "unsaved" : "demo"}</span>
        )}
      </div>
      <button
        className="btn sm"
        type="button"
        title="Download the full project zip to this browser/device"
        onClick={async () => {
          try {
            s.setToast("Preparing project download…");
            await flushNow();
            const dir = await browserSaveDirectory();
            const r = await request<{ ok: boolean; path?: string; incomplete?: string[] }>(
              "save_project_zip", { name: s.project_name, dir }, 3600000);
            if (!r?.path) throw new Error("Wan2GP did not return the saved project path");
            if (r.incomplete?.length) {
              s.setToast(`SAVE INCOMPLETE - missing: ${r.incomplete.join(", ")}`);
              return;
            }
            downloadServerFile(r.path, serverFileName(r.path));
            s.setToast(`Download started: ${serverFileName(r.path)}`);
          } catch (e) {
            s.setToast(`Save failed: ${String(e)}`);
          }
        }}
      >
        Save
      </button>
      <button className="btn sm" type="button"
        title="Save directly to a folder on the machine running Wan2GP"
        onClick={async () => {
          try {
            const pick = await request<{ dir?: string }>("browse_dir", {}, 180000);
            if (!pick?.dir) return;
            s.patch({ saveDir: pick.dir });
            await flushNow();
            const r = await request<{ path?: string }>("save_project_zip",
              { name: s.project_name, dir: pick.dir }, 3600000);
            s.setToast(`Saved on host to ${r?.path || pick.dir}`);
          } catch (e) { s.setToast(`Host save failed: ${String(e)}`); }
        }}>
        Host save…
      </button>
      <button className="btn sm" type="button" title="Open a project zip or settings JSON from this browser/device"
        onClick={() => fileRef.current?.click()}>
        Load
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,.json,.h3director.json,application/json,application/zip"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const lower = f.name.toLowerCase();
            if (lower.endsWith(".zip") || f.type.toLowerCase().includes("zip")) {
              s.setToast(`Uploading ${f.name}…`);
              const path = await uploadBrowserFile(f);
              const r = await request<{ payload?: unknown; restored?: number; name?: string;
                media?: Record<string, never>; missing?: string[]; fileBase?: string }>(
                "open_project_zip", { path }, 3600000);
              if (!r?.payload) throw new Error("Project archive did not contain a loadable project");
              const { hydrateMedia } = await import("../lib/media");
              hydrateMedia(r.media, r.fileBase, r.missing);
              s.loadSession(r.payload as never);
              s.setToast(`Opened ${r.name || f.name} - ${r.restored || 0} media file(s) restored`);
              return;
            }
            s.loadSession(await readSessionFile(f));
            s.setToast(`Opened ${f.name}`);
          } catch (err) {
            s.setToast(err instanceof Error ? err.message : "Could not load");
          }
        }}
      />
      <button className="btn sm" type="button"
        title="Reload the last autosaved project."
        onClick={() => s.recover()}>
        Restore autosave
      </button>
      <div style={{ flex: 1 }} />

      <div className="chipf num">{chip}</div>
      <span className="build-badge" title="Plugin UI build — if this does not match the version in the terminal, the browser is showing a cached bundle">v{H3D2_BUILD}</span>
    </header>
  );
}
