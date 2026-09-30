import { useState } from "react";
import {
  Blocks,
  Download,
  Film,
  FolderOpen,
  Images,
  Menu,
  Music,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Waves,
  X,
} from "lucide-react";
import { useDirector } from "../lib/store";
import type { PaneId } from "../lib/types";

export type MobileSurface = "timeline" | "stage" | "inspector";

type PaneItem = { id: PaneId; label: string; icon: JSX.Element };

const SIZE = 19;
const MORE: PaneItem[] = [
  { id: "audio", label: "Audio", icon: <Music size={SIZE} /> },
  { id: "project", label: "Project", icon: <FolderOpen size={SIZE} /> },
  { id: "sfx", label: "Sound design", icon: <Waves size={SIZE} /> },
  { id: "export", label: "Export", icon: <Download size={SIZE} /> },
  { id: "builder", label: "Hybrid builder", icon: <Blocks size={SIZE} /> },
  { id: "diag", label: "Diagnostics", icon: <Stethoscope size={SIZE} /> },
];

export function MobileNav({
  surface,
  onSurface,
}: {
  surface: MobileSurface;
  onSurface: (surface: MobileSurface) => void;
}) {
  const s = useDirector();
  const [moreOpen, setMoreOpen] = useState(false);
  const secondaryActive = surface === "stage" && MORE.some((x) => x.id === s.pane);

  const openPane = (id: PaneId) => {
    s.setPane(id);
    onSurface("stage");
    setMoreOpen(false);
  };

  return (
    <>
      {moreOpen && (
        <div className="mobile-more-back" role="presentation" onClick={() => setMoreOpen(false)}>
          <div className="mobile-more-sheet" role="dialog" aria-label="More tools" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-more-head">
              <strong>More</strong>
              <button type="button" className="mobile-icon-btn" aria-label="Close" onClick={() => setMoreOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="mobile-more-grid">
              {MORE.map((it) => (
                <button
                  type="button"
                  key={it.id}
                  className={`mobile-more-item${surface === "stage" && s.pane === it.id ? " on" : ""}`}
                  onClick={() => openPane(it.id)}
                >
                  {it.icon}
                  <span>{it.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-nav" aria-label="Director navigation">
        <button
          type="button"
          className={surface === "timeline" ? "on" : ""}
          onClick={() => { setMoreOpen(false); onSurface("timeline"); }}
        >
          <Film size={SIZE} />
          <span>Timeline</span>
        </button>
        <button
          type="button"
          className={surface === "stage" && s.pane === "refs" ? "on" : ""}
          onClick={() => openPane("refs")}
        >
          <Images size={SIZE} />
          <span>Refs</span>
        </button>
        <button
          type="button"
          className={surface === "stage" && s.pane === "gen" ? "on" : ""}
          onClick={() => openPane("gen")}
        >
          <Sparkles size={SIZE} />
          <span>Generate</span>
        </button>
        <button
          type="button"
          className={surface === "inspector" ? "on" : ""}
          onClick={() => { setMoreOpen(false); onSurface("inspector"); }}
        >
          <SlidersHorizontal size={SIZE} />
          <span>Edit</span>
        </button>
        <button
          type="button"
          className={moreOpen || secondaryActive ? "on" : ""}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <Menu size={SIZE} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
