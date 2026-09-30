import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, AudioLines, Blocks, ChevronRight, Film, FolderOpen, Home,
  Images, MonitorPlay, Music, Save, Sparkles, Stethoscope, WandSparkles, Waves,
} from "lucide-react";
import { useDirector, useWindowStats } from "../lib/store";
import type { PaneId } from "../lib/types";
import { Timeline } from "./Timeline";
import { Stage } from "./Stage";
import { Inspector } from "./Inspector";
import { ActionBar } from "./ActionBar";

export type MobileScreen =
  | "home" | "timeline" | "refs" | "gen" | "audio" | "project"
  | "results" | "sfx" | "export" | "builder" | "diag";

const ICON = 23;

function Card({ icon, title, sub, badge, onClick }: {
  icon: ReactNode; title: string; sub: string; badge?: string; onClick: () => void;
}) {
  return (
    <button type="button" className="md-card" onClick={onClick}>
      <span className="md-card-icon">{icon}</span>
      <span className="md-card-copy">
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
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
        <button type="button" className="md-head-btn" aria-label="Back to dashboard" onClick={home}>
          <ArrowLeft size={21} />
        </button>
      ) : <span className="md-head-mark"><WandSparkles size={20} /></span>}
      <div className="md-head-copy">
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </div>
      {right && <div className="md-head-right">{right}</div>}
    </header>
  );
}

function Dock({ screen, go }: { screen: MobileScreen; go: (s: MobileScreen) => void }) {
  return (
    <nav className="md-dock" aria-label="Mobile Director navigation">
      <button className={screen === "home" ? "on" : ""} onClick={() => go("home")} type="button">
        <Home size={20} /><span>Home</span>
      </button>
      <button className={screen === "timeline" ? "on" : ""} onClick={() => go("timeline")} type="button">
        <Film size={20} /><span>Timeline</span>
      </button>
      <button className={screen === "gen" ? "on" : ""} onClick={() => go("gen")} type="button">
        <Sparkles size={20} /><span>Generate</span>
      </button>
    </nav>
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
              <button type="button" className="md-result-open" onClick={() => {
                s.setPlayhead(c.start);
                s.setResultView({ group: c.group, opened: Date.now() });
              }}>
                <span className="md-result-play"><MonitorPlay size={30} /></span>
                <span><strong>Group {c.group}</strong><small>Windows {c.first_window + 1}{c.n_windows > 1 ? `–${c.first_window + c.n_windows}` : ""} · {c.status}</small></span>
              </button>
              <div className="md-result-actions">
                <button type="button" disabled={busy} className={marked ? "on" : ""} onClick={() => s.toggleRegenMark(c.group)}>
                  {marked ? "Marked for regen" : "Mark for regen"}
                </button>
                {c.n_windows > 1 && <button type="button" disabled={busy} onClick={() => void s.splitClip(c.group)}>Split</button>}
              </div>
            </article>
          );
        })}
        {!!clips.length && (
          <button className="md-primary" type="button" disabled={busy} onClick={() => void s.stitch()}>
            {s.stitching ? "Stitching…" : `Stitch full video (${clips.length} clips)`}
          </button>
        )}
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
        <div className="md-project-hero">
          <div>
            <small>PROJECT</small>
            <h1>{s.project_name || "Untitled"}</h1>
            <p>{s.duration_sec.toFixed(s.duration_sec % 1 ? 1 : 0)} sec · {stats.windows} windows · {res}</p>
          </div>
          <span className={`md-save-dot${s.dirty ? " dirty" : ""}`} title={s.dirty ? "Unsaved changes" : "Autosaved"} />
        </div>

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
  refs: "refs", gen: "gen", audio: "audio", project: "project",
  sfx: "sfx", export: "export", builder: "builder", diag: "diag",
};

const SCREEN_TITLE: Partial<Record<MobileScreen, string>> = {
  refs: "References", gen: "Generate", audio: "Audio", project: "Project",
  sfx: "Sound design", export: "Export", builder: "Hybrid builder", diag: "Diagnostics",
};

export function MobileDirector() {
  const s = useDirector();
  const [screen, setScreen] = useState<MobileScreen>("home");
  const [editorOpen, setEditorOpen] = useState(false);
  const lastSelected = useRef(s.selectedId);

  const go = (next: MobileScreen) => {
    const pane = SCREEN_PANE[next];
    if (pane) s.setPane(pane);
    setEditorOpen(false);
    setScreen(next);
  };

  useEffect(() => {
    if (screen === "timeline" && s.selectedId && s.selectedId !== lastSelected.current) setEditorOpen(true);
    lastSelected.current = s.selectedId;
  }, [s.selectedId, screen]);

  if (screen === "home") return <div className="mobile-director"><HomeScreen go={go} /><Dock screen={screen} go={go} /></div>;
  if (screen === "results") return <div className="mobile-director"><ResultsScreen home={() => go("home")} /><Dock screen={screen} go={go} /></div>;

  if (screen === "timeline") {
    const selected = s.timeline.segments.find((x) => x.id === s.selectedId);
    return (
      <div className="mobile-director">
        <section className="md-screen md-timeline-screen">
          <Header title="Timeline" sub={`${s.duration_sec.toFixed(1)} sec · ${s.timeline.segments.length} items`} home={() => go("home")} right={selected ? (
            <button className="md-head-action" type="button" onClick={() => setEditorOpen(true)}>Edit</button>
          ) : undefined} />
          <div className="md-timeline-work"><Timeline /></div>
          {selected && !editorOpen && (
            <button type="button" className="md-selected-pill" onClick={() => setEditorOpen(true)}>
              <AudioLines size={17} /> <span>{selected.title || "Selected clip"}</span> <ChevronRight size={17} />
            </button>
          )}
          {editorOpen && selected && (
            <div className="md-editor-back" onClick={() => setEditorOpen(false)} role="presentation">
              <div className="md-editor-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="md-editor-grab" />
                <Inspector />
              </div>
            </div>
          )}
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
