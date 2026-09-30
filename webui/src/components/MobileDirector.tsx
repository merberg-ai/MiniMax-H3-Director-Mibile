import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, AudioLines, Blocks, ChevronRight, Film, FolderOpen, Home,
  Images, MonitorPlay, Music, Save, Sparkles, Stethoscope, WandSparkles, Waves,
} from "lucide-react";
import { useDirector, useWindowStats } from "../lib/store";
import type { PaneId } from "../lib/types";
import { request } from "../lib/bridge";
import { flushNow } from "../lib/persist";
import { readSessionFile } from "../lib/session";
import { Timeline } from "./Timeline";
import { Stage } from "./Stage";
import { Inspector } from "./Inspector";
import { ActionBar } from "./ActionBar";

export type MobileScreen =
  | "home" | "timeline" | "refs" | "gen" | "audio" | "project"
  | "results" | "sfx" | "export" | "builder" | "diag";

const ICON = 23;

function browserBase(): string {
  const origin = (window.location && window.location.origin) || "";
  return origin && origin !== "null" ? origin : "";
}

async function uploadBrowserFile(file: File): Promise<string> {
  let lastError = "Gradio upload endpoint did not respond";
  for (const ep of ["/gradio_api/upload", "/upload"]) {
    try {
      const fd = new FormData();
      fd.append("files", file, file.name);
      const res = await fetch(browserBase() + ep, { method: "POST", body: fd });
      if (!res.ok) { lastError = `${ep} returned HTTP ${res.status}`; continue; }
      const paths = await res.json();
      const serverPath = Array.isArray(paths) ? paths[0] : paths;
      if (typeof serverPath === "string" && serverPath) return serverPath;
      lastError = `${ep} returned no file path`;
    } catch (e) { lastError = String(e); }
  }
  throw new Error(lastError);
}

function serverParent(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (i <= 0) throw new Error(`Could not determine the server directory from ${path}`);
  return path.slice(0, i);
}
function serverJoin(base: string, ...parts: string[]): string {
  const sep = base.includes("\\") ? "\\" : "/";
  return [base.replace(/[\\/]+$/, ""), ...parts.map((p) => p.replace(/^[\\/]+|[\\/]+$/g, ""))].join(sep);
}
function serverFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || "h3-director-project.zip";
}
function downloadServerFile(path: string): void {
  const a = document.createElement("a");
  a.href = `${browserBase()}/gradio_api/file=${encodeURIComponent(path)}`;
  a.download = serverFileName(path);
  a.style.display = "none";
  document.body.appendChild(a); a.click(); a.remove();
}
async function browserSaveDirectory(): Promise<string> {
  const r = await request<{ dir?: string }>("list_projects", {}, 30000);
  if (!r?.dir) throw new Error("Wan2GP did not report the project directory");
  return serverJoin(serverParent(r.dir), "workspace", "derived");
}

function Card({ icon, title, sub, badge, onClick }: {
  icon: ReactNode; title: string; sub: string; badge?: string; onClick: () => void;
}) {
  return (
    <button type="button" className="md-card" onClick={onClick}>
      <span className="md-card-icon">{icon}</span>
      <span className="md-card-copy"><strong>{title}</strong><small>{sub}</small></span>
      {badge && <span className="md-card-badge">{badge}</span>}
      <ChevronRight size={18} className="md-card-chevron" />
    </button>
  );
}

function Header({ title, sub, home, right }: {
  title: string; sub?: string; home?: () => void; right?: ReactNode;
}) {
  return (
    <header className="md-head">
      {home ? (
        <button type="button" className="md-head-btn" aria-label="Back to dashboard" onClick={home}><ArrowLeft size={21} /></button>
      ) : <span className="md-head-mark"><WandSparkles size={20} /></span>}
      <div className="md-head-copy"><strong>{title}</strong>{sub && <small>{sub}</small>}</div>
      {right && <div className="md-head-right">{right}</div>}
    </header>
  );
}

function Dock({ screen, go }: { screen: MobileScreen; go: (s: MobileScreen) => void }) {
  return (
    <nav className="md-dock" aria-label="Mobile Director navigation">
      <button className={screen === "home" ? "on" : ""} onClick={() => go("home")} type="button"><Home size={20} /><span>Home</span></button>
      <button className={screen === "timeline" ? "on" : ""} onClick={() => go("timeline")} type="button"><Film size={20} /><span>Timeline</span></button>
      <button className={screen === "gen" ? "on" : ""} onClick={() => go("gen")} type="button"><Sparkles size={20} /><span>Generate</span></button>
    </nav>
  );
}

function ProjectScreen({ home }: { home: () => void }) {
  const s = useDirector();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");

  const save = async () => {
    setBusy("Preparing download…");
    try {
      await flushNow();
      const dir = await browserSaveDirectory();
      const r = await request<{ ok: boolean; path?: string; incomplete?: string[] }>(
        "save_project_zip", { name: s.project_name, dir }, 3600000);
      if (!r?.path) throw new Error("Wan2GP did not return the project archive path");
      if (r.incomplete?.length) throw new Error(`Project is missing: ${r.incomplete.join(", ")}`);
      downloadServerFile(r.path);
      s.setToast(`Download started: ${serverFileName(r.path)}`);
    } catch (e) { s.setToast(`Save failed: ${String(e)}`); }
    finally { setBusy(""); }
  };

  return (
    <section className="md-screen md-mobile-project">
      <Header title="Project" sub={s.project_name || "Untitled"} home={home} />
      <div className="md-scroll md-project-page">
        <div className="md-project-status">
          <small>AUTOSAVE</small>
          <strong>{s.dirty ? "Changes pending" : s.saveInfo || "Connected"}</strong>
          <span className={`md-save-dot${s.dirty ? " dirty" : ""}`} />
        </div>
        <button className="md-project-action primary" type="button" disabled={!!busy} onClick={() => void save()}>
          <Save size={22} /><span><strong>{busy || "Save project ZIP"}</strong><small>Download the full project to this phone/browser</small></span><ChevronRight size={18} />
        </button>
        <button className="md-project-action" type="button" onClick={() => fileRef.current?.click()}>
          <FolderOpen size={22} /><span><strong>Load project</strong><small>Open a ZIP or Director JSON from this device</small></span><ChevronRight size={18} />
        </button>
        <input
          ref={fileRef} hidden type="file"
          accept=".zip,.json,.h3director.json,application/json,application/zip"
          onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
            try {
              if (f.name.toLowerCase().endsWith(".zip") || f.type.toLowerCase().includes("zip")) {
                s.setToast(`Uploading ${f.name}…`);
                const path = await uploadBrowserFile(f);
                const r = await request<{ payload?: unknown; restored?: number; name?: string; media?: Record<string, never>; missing?: string[]; fileBase?: string }>(
                  "open_project_zip", { path }, 3600000);
                if (!r?.payload) throw new Error("Archive did not contain a loadable project");
                const { hydrateMedia } = await import("../lib/media");
                hydrateMedia(r.media, r.fileBase, r.missing);
                s.loadSession(r.payload as never);
                s.setToast(`Opened ${r.name || f.name} · ${r.restored || 0} media file(s)`);
              } else {
                s.loadSession(await readSessionFile(f));
                s.setToast(`Opened ${f.name}`);
              }
            } catch (err) { s.setToast(err instanceof Error ? err.message : "Could not load project"); }
          }}
        />
        <button className="md-project-action" type="button" onClick={() => s.recover()}>
          <Waves size={22} /><span><strong>Restore autosave</strong><small>Reload the last project.json saved by Director</small></span><ChevronRight size={18} />
        </button>
        <div className="md-project-note">Host-machine folder operations are intentionally left out of the mobile interface.</div>
      </div>
    </section>
  );
}

function ResultsScreen({ home }: { home: () => void }) {
  const s = useDirector();
  const clips = s.render?.clips || [];
  const busy = s.job.status === "running" || s.stitching || !!s.splitting;
  return (
    <section className="md-screen md-results">
      <Header title="Results" sub={`${clips.length} rendered clip${clips.length === 1 ? "" : "s"}`} home={home} />
      <div className="md-scroll">
        {!clips.length && <div className="md-empty">Nothing rendered yet. Generate the timeline and finished groups will appear here.</div>}
        {clips.map((c) => {
          const marked = s.regenMarks.includes(c.group);
          return (
            <article className="md-result-card" key={`${c.group}-${c.master}`}>
              <button type="button" className="md-result-open" onClick={() => { s.setPlayhead(c.start); s.setResultView({ group: c.group, opened: Date.now() }); }}>
                <span className="md-result-play"><MonitorPlay size={30} /></span>
                <span><strong>Group {c.group}</strong><small>Windows {c.first_window + 1}{c.n_windows > 1 ? `–${c.first_window + c.n_windows}` : ""} · {c.status}</small></span>
              </button>
              <div className="md-result-actions">
                <button type="button" disabled={busy} className={marked ? "on" : ""} onClick={() => s.toggleRegenMark(c.group)}>{marked ? "Marked for regen" : "Mark for regen"}</button>
                {c.n_windows > 1 && <button type="button" disabled={busy} onClick={() => void s.splitClip(c.group)}>Split</button>}
              </div>
            </article>
          );
        })}
        {!!clips.length && <button className="md-primary" type="button" disabled={busy} onClick={() => void s.stitch()}>{s.stitching ? "Stitching…" : `Stitch full video (${clips.length} clips)`}</button>}
      </div>
    </section>
  );
}

function HomeScreen({ go }: { go: (s: MobileScreen) => void }) {
  const s = useDirector();
  const stats = useWindowStats();
  const refs = s.refs.images.length + s.refs.videos.length + s.refs.audio.length;
  const scenes = s.timeline.segments.filter((x) => x.track === "video").length;
  const clips = s.render?.clips?.length || 0;
  const res = String(s.advanced.resolution || "").replace("x", "×");
  return (
    <section className="md-screen md-home">
      <Header title="H3 Director" sub={s.project_name || "Untitled project"} />
      <div className="md-home-scroll">
        <div className="md-project-hero"><div><small>PROJECT</small><h1>{s.project_name || "Untitled"}</h1><p>{s.duration_sec.toFixed(s.duration_sec % 1 ? 1 : 0)} sec · {stats.windows} windows · {res}</p></div><span className={`md-save-dot${s.dirty ? " dirty" : ""}`} /></div>
        <div className="md-grid">
          <Card icon={<Film size={ICON} />} title="Timeline" sub={`${scenes} scene${scenes === 1 ? "" : "s"} · ${s.duration_sec.toFixed(1)} sec`} badge={`${stats.windows} win`} onClick={() => go("timeline")} />
          <Card icon={<Images size={ICON} />} title="References" sub={`${refs} file${refs === 1 ? "" : "s"}`} badge={s.refs.images.length ? `${s.refs.images.length} img` : undefined} onClick={() => go("refs")} />
          <Card icon={<Sparkles size={ICON} />} title="Generate" sub={`${s.pipeline} · ${String(s.advanced.steps)} steps`} badge={s.job.status === "running" ? "RUNNING" : undefined} onClick={() => go("gen")} />
          <Card icon={<Music size={ICON} />} title="Audio" sub={s.refs.audio.length ? `${s.refs.audio.length} voice/audio ref` : "Prompt or timeline audio"} onClick={() => go("audio")} />
          <Card icon={<FolderOpen size={ICON} />} title="Project" sub={s.dirty ? "Unsaved changes" : s.saveInfo || "Autosaved"} onClick={() => go("project")} />
          <Card icon={<MonitorPlay size={ICON} />} title="Results" sub={clips ? `${clips} rendered clip${clips === 1 ? "" : "s"}` : "Nothing rendered yet"} badge={s.render?.stitch_stale ? "STALE" : undefined} onClick={() => go("results")} />
        </div>
        <h2 className="md-section-title">More tools</h2>
        <div className="md-tool-list">
          <button type="button" onClick={() => go("sfx")}><Waves size={18} /><span>Sound design</span><ChevronRight size={17} /></button>
          <button type="button" onClick={() => go("export")}><Save size={18} /><span>Export</span><ChevronRight size={17} /></button>
          <button type="button" onClick={() => go("builder")}><Blocks size={18} /><span>Hybrid builder</span><ChevronRight size={17} /></button>
          <button type="button" onClick={() => go("diag")}><Stethoscope size={18} /><span>Diagnostics</span><ChevronRight size={17} /></button>
        </div>
      </div>
    </section>
  );
}

const SCREEN_PANE: Partial<Record<MobileScreen, PaneId>> = {
  refs: "refs", gen: "gen", audio: "audio", sfx: "sfx", export: "export", builder: "builder", diag: "diag",
};
const SCREEN_TITLE: Partial<Record<MobileScreen, string>> = {
  refs: "References", gen: "Generate", audio: "Audio", sfx: "Sound design", export: "Export", builder: "Hybrid builder", diag: "Diagnostics",
};

export function MobileDirector() {
  const s = useDirector();
  const [screen, setScreen] = useState<MobileScreen>("home");
  const [editorOpen, setEditorOpen] = useState(false);
  const lastSelected = useRef(s.selectedId);
  const go = (next: MobileScreen) => {
    const pane = SCREEN_PANE[next]; if (pane) s.setPane(pane);
    setEditorOpen(false); setScreen(next);
  };
  useEffect(() => {
    if (screen === "timeline" && s.selectedId && s.selectedId !== lastSelected.current) setEditorOpen(true);
    lastSelected.current = s.selectedId;
  }, [s.selectedId, screen]);

  if (screen === "home") return <div className="mobile-director"><HomeScreen go={go} /><Dock screen={screen} go={go} /></div>;
  if (screen === "project") return <div className="mobile-director"><ProjectScreen home={() => go("home")} /><Dock screen={screen} go={go} /></div>;
  if (screen === "results") return <div className="mobile-director"><ResultsScreen home={() => go("home")} /><Dock screen={screen} go={go} /></div>;

  if (screen === "timeline") {
    const selected = s.timeline.segments.find((x) => x.id === s.selectedId);
    return (
      <div className="mobile-director">
        <section className="md-screen md-timeline-screen">
          <Header title="Timeline" sub={`${s.duration_sec.toFixed(1)} sec · ${s.timeline.segments.length} items`} home={() => go("home")} right={selected ? <button className="md-head-action" type="button" onClick={() => setEditorOpen(true)}>Edit</button> : undefined} />
          <div className="md-timeline-work"><Timeline /></div>
          {selected && !editorOpen && <button type="button" className="md-selected-pill" onClick={() => setEditorOpen(true)}><AudioLines size={17} /><span>{selected.title || "Selected clip"}</span><ChevronRight size={17} /></button>}
          {editorOpen && selected && <div className="md-editor-back" onClick={() => setEditorOpen(false)} role="presentation"><div className="md-editor-sheet" onClick={(e) => e.stopPropagation()}><div className="md-editor-grab" /><Inspector /></div></div>}
        </section>
        <Dock screen={screen} go={go} />
      </div>
    );
  }

  const title = SCREEN_TITLE[screen] || "Director";
  return (
    <div className="mobile-director">
      <section className={`md-screen md-pane-screen md-${screen}`}>
        <Header title={title} sub={screen === "gen" ? `${s.pipeline} · ${String(s.advanced.resolution || "")}` : undefined} home={() => go("home")} />
        <div className="md-pane-work"><Stage /></div>
        {screen === "gen" && <ActionBar />}
      </section>
      <Dock screen={screen} go={go} />
    </div>
  );
}
