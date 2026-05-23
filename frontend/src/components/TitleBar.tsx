// TitleBar: top chrome — wordmark, active file, entity chip, mode toggle.
// Terminal theme: monospace labels, phosphor-green accent, hairline borders.
import { ShieldCheck, MessageSquareText, PanelsTopLeft, Terminal } from "lucide-react";
import { motion } from "framer-motion";
import type { EntityItem, SessionStats } from "../lib/api";
import { DEMO_FILES, formatFileName } from "../lib/demoDocument";

interface TitleBarProps {
  entities?: EntityItem[];
  auditStats?: SessionStats | null;
  activeFileName?: string;
  fileRenames?: Record<string, string>;
  uiMode: "work" | "chat";
  onModeChange: (mode: "work" | "chat") => void;
}

export default function TitleBar({
  entities = [],
  auditStats,
  activeFileName = "",
  fileRenames = {},
  uiMode,
  onModeChange,
}: TitleBarProps) {
  const phiCount  = entities.filter((e) => e.category === "phi").length;
  const ipCount   = entities.filter((e) => e.category === "ip").length;
  const mnpiCount = entities.filter((e) => e.category === "mnpi").length;

  const displayLabel =
    fileRenames[activeFileName] ??
    DEMO_FILES[activeFileName]?.label ??
    formatFileName(activeFileName) ??
    "untitled";

  return (
    <header
      className="surface-header"
      style={{
        height: 48,
        flexShrink: 0,
        borderBottom: "1px solid var(--color-border)",
        padding: "0 16px",
      }}
    >
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "space-between", gap: 12 }}>

        {/* Left — logo + file breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={{
            width: 28, height: 28, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "var(--radius-sm)",
            background: "oklch(72% 0.18 145 / 0.10)",
            border: "1px solid var(--color-accent-border)",
            color: "var(--color-accent)",
          }}>
            <Terminal size={13} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 0, minWidth: 0 }}>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-base)",
              fontWeight: 600,
              color: "var(--color-ink)",
              letterSpacing: "0.04em",
              flexShrink: 0,
            }}>
              GhostDraft
            </span>
            {displayLabel && (
              <>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-sm)",
                  color: "var(--color-ink-4)",
                  margin: "0 6px",
                  flexShrink: 0,
                }}>/</span>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-sm)",
                  color: "var(--color-ink-3)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}>
                  {displayLabel}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Centre — workspace label (hidden on small screens) */}
        <div style={{
          flex: 1, display: "flex", justifyContent: "center",
          overflow: "hidden",
        }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            color: "var(--color-ink-4)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}>
            // privacy_workspace
          </span>
        </div>

        {/* Right — entity chip + mode toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>

          {/* Entity counts chip */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "oklch(100% 0 0 / 0.02)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-sm)",
              fontVariantNumeric: "tabular-nums",
            }}
            title={
              auditStats
                ? `${auditStats.total_requests} requests · ${auditStats.proxied} proxied`
                : "Entity counts for loaded document"
            }
          >
            <ShieldCheck size={12} style={{ color: "var(--color-accent-dim)", flexShrink: 0 }} />
            <span style={{ color: "var(--color-phi)" }}>{phiCount}</span>
            <span style={{ color: "var(--color-ink-5)" }}>·</span>
            <span style={{ color: "var(--color-ip)" }}>{ipCount}</span>
            <span style={{ color: "var(--color-ink-5)" }}>·</span>
            <span style={{ color: "var(--color-mnpi)" }}>{mnpiCount}</span>
            {auditStats && auditStats.total_requests > 0 && (
              <>
                <span style={{ color: "var(--color-ink-5)" }}>·</span>
                <span style={{ color: "var(--color-ink-3)" }}>{auditStats.total_requests}</span>
              </>
            )}
          </div>

          <ModeToggle uiMode={uiMode} onModeChange={onModeChange} />
        </div>
      </div>
    </header>
  );
}

// Mode toggle — Work / Chat switcher with spring animation.
function ModeToggle({
  uiMode,
  onModeChange,
}: {
  uiMode: "work" | "chat";
  onModeChange: (mode: "work" | "chat") => void;
}) {
  const options = [
    { id: "work" as const, label: "work", icon: PanelsTopLeft },
    { id: "chat" as const, label: "chat", icon: MessageSquareText },
  ];

  return (
    <div style={{
      position: "relative", display: "flex", alignItems: "center",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--color-border)",
      background: "oklch(11% 0.009 240)",
      padding: 3,
    }}>
      {options.map((option) => {
        const Icon = option.icon;
        const active = uiMode === option.id;
        return (
          <button
            key={option.id}
            onClick={() => onModeChange(option.id)}
            style={{
              position: "relative", zIndex: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 6, minWidth: 80, padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              border: "none", background: "transparent",
              color: active ? "var(--color-ink)" : "var(--color-ink-4)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-sm)",
              fontWeight: active ? 500 : 400,
              letterSpacing: "0.04em",
              cursor: "pointer",
              transition: "color var(--dur-fast) var(--ease-out)",
            }}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                style={{
                  position: "absolute", inset: 0,
                  borderRadius: "var(--radius-sm)",
                  background: "oklch(17% 0.011 240)",
                  boxShadow: "inset 0 1px 0 oklch(100% 0 0 / 0.05), 0 0 12px oklch(72% 0.18 145 / 0.06)",
                  border: "1px solid var(--color-border-strong)",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <Icon size={13} style={{ position: "relative", zIndex: 1 }} />
            <span style={{ position: "relative", zIndex: 1 }}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
