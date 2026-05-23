// BottomDock: collapsible forensic log strip at the bottom of the application shell.
// Terminal theme: monospace status line, phosphor-green ε meter, hairline top border.
import React, { useRef, useCallback } from "react";
import { ChevronUp, ChevronDown, Shield } from "lucide-react";
import { BottomDockForensic } from "./BottomDockForensic";
import { useForensicStream } from "../hooks/useForensicStream";
import type { AuditEntry } from "../hooks/useForensicStream";

interface BottomDockProps {
  expanded: boolean;
  heightPct: number;
  onToggle: () => void;
  onResize: (pct: number) => void;
}

// Format a Date as HH:MM:SS for the collapsed status line.
function formatTime(d: Date): string {
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

// Format an ISO timestamp string to HH:MM:SS local time for the status line.
function formatIso(iso: string): string {
  return formatTime(new Date(iso));
}

// Drag handle rendered at the top edge of the expanded dock for vertical resizing.
const DragHandle: React.FC<{ onDragStart: (e: React.PointerEvent) => void }> = ({ onDragStart }) => (
  <div
    onPointerDown={onDragStart}
    style={{
      height: 3,
      cursor: "ns-resize",
      flexShrink: 0,
      background: "var(--color-border)",
      transition: "background var(--dur-fast) var(--ease-out)",
    }}
    onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = "oklch(72% 0.18 145 / 0.40)")}
    onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = "var(--color-border)")}
    aria-hidden="true"
  />
);

// Expanded forensic log with three columns: Proxy Sent, Cloud Response, Rehydrated.
const ExpandedDock: React.FC<{
  heightPct: number;
  onResize: (pct: number) => void;
  entries: AuditEntry[];
  epsilonSpent: number;
  epsilonCap: number;
}> = ({ heightPct, onResize, entries, epsilonSpent, epsilonCap }) => {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startPct = useRef(heightPct);

  // Begin vertical resize drag.
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    startY.current = e.clientY;
    startPct.current = heightPct;
  }, [heightPct]);

  // Compute new height percentage from drag position.
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const deltaY = startY.current - e.clientY;
    const deltaPct = (deltaY / window.innerHeight) * 100;
    onResize(Math.max(8, Math.min(60, startPct.current + deltaPct)));
  }, [onResize]);

  // End drag.
  const handlePointerUp = useCallback(() => { dragging.current = false; }, []);

  return (
    <div
      style={{ height: `${heightPct}vh`, display: "flex", flexDirection: "column" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <DragHandle onDragStart={handleDragStart} />
      <BottomDockForensic
        entries={entries}
        epsilonSpent={epsilonSpent}
        epsilonCap={epsilonCap}
      />
    </div>
  );
};

// Renders either the collapsed single-line status or the expanded three-column forensic view.
export const BottomDock: React.FC<BottomDockProps> = ({ expanded, heightPct, onToggle, onResize }) => {
  const { entries, epsilonSpent, epsilonCap } = useForensicStream();

  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;

  // ε budget bar width as percentage
  const epsilonPct = Math.min(100, (epsilonSpent / epsilonCap) * 100);
  const epsilonColor = epsilonPct > 80
    ? "var(--color-error)"
    : epsilonPct > 50
    ? "var(--color-warning)"
    : "var(--color-accent)";

  const statusText = lastEntry
    ? `${formatIso(lastEntry.timestamp)}  ·  ${lastEntry.status}  ·  ${lastEntry.model}  ·  ε ${epsilonSpent.toFixed(2)} / ${epsilonCap}`
    : `${formatTime(new Date())}  ·  no cloud calls yet  ·  ε ${epsilonSpent.toFixed(2)} / ${epsilonCap}`;

  return (
    <div style={{
      background: "oklch(9.5% 0.008 240 / 0.98)",
      borderTop: "1px solid var(--color-border)",
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      userSelect: expanded ? "none" : "auto",
    }}>
      {expanded && (
        <ExpandedDock
          heightPct={heightPct}
          onResize={onResize}
          entries={entries}
          epsilonSpent={epsilonSpent}
          epsilonCap={epsilonCap}
        />
      )}

      {/* Collapsed status line — always visible */}
      <div
        style={{
          height: 22,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          gap: 8,
          cursor: "pointer",
          flexShrink: 0,
        }}
        onClick={onToggle}
        title={expanded ? "collapse forensic log" : "expand forensic log"}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
        aria-label={expanded ? "Collapse forensic log" : "Expand forensic log"}
        aria-expanded={expanded}
      >
        {/* Toggle chevron */}
        {expanded
          ? <ChevronDown size={10} style={{ color: "var(--color-ink-4)", flexShrink: 0 }} />
          : <ChevronUp   size={10} style={{ color: "var(--color-ink-4)", flexShrink: 0 }} />}

        {/* Shield icon */}
        <Shield size={9} style={{ color: "var(--color-accent-dim)", flexShrink: 0 }} />

        {/* Status text */}
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--color-ink-4)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flex: 1,
          letterSpacing: "0.02em",
        }}>
          {statusText}
        </span>

        {/* ε budget bar */}
        <div style={{
          width: 48, height: 3,
          borderRadius: 999,
          background: "var(--color-paper-3)",
          flexShrink: 0,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${epsilonPct}%`,
            borderRadius: 999,
            background: epsilonColor,
            transition: "width var(--dur-slow) var(--ease-out), background var(--dur-base) var(--ease-out)",
            boxShadow: epsilonPct > 0 ? `0 0 6px ${epsilonColor}` : "none",
          }} />
        </div>
      </div>
    </div>
  );
};
