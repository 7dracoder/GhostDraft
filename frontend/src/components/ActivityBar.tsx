// ActivityBar: vertical icon strip — RECORDS and VITALS switch personas.
// Terminal theme: phosphor-green active indicator, monospace tooltips.
import { Stethoscope, Activity, Pill, FlaskConical, HeartPulse, Settings, UserRound, LogOut } from "lucide-react";
import { useLayoutState } from "../layout/useLayoutState";
import { useAuth } from "../lib/auth";

// Renders the activity bar with persona switchers and disabled production icons.
export default function ActivityBar() {
  const { persona, setPersona } = useLayoutState();
  const { user, signOut } = useAuth();

  const navItems = [
    { id: "RECORDS",    icon: Stethoscope, label: "reviewer — SAE narrative review", personaTarget: "reviewer" as const, disabled: false },
    { id: "VITALS",     icon: Activity,    label: "analyst — dataset and dashboard",  personaTarget: "analyst"  as const, disabled: false },
    { id: "PHARMACY",   icon: Pill,        label: "// production feature",            personaTarget: null,                disabled: true  },
    { id: "LABS",       icon: FlaskConical,label: "// production feature",            personaTarget: null,                disabled: true  },
    { id: "CARDIOLOGY", icon: HeartPulse,  label: "// production feature",            personaTarget: null,                disabled: true  },
  ];

  return (
    <nav
      style={{
        width: 52,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        borderRight: "1px solid var(--color-border)",
        background: "linear-gradient(180deg, oklch(11% 0.009 240), oklch(10% 0.008 240))",
        padding: "8px 0",
        zIndex: 40,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: 2 }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.personaTarget !== null && persona === item.personaTarget;

          return (
            <button
              key={item.id}
              onClick={item.personaTarget !== null ? () => setPersona(item.personaTarget!) : undefined}
              title={item.label}
              disabled={item.disabled}
              aria-label={item.label}
              aria-pressed={isActive}
              style={{
                position: "relative",
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px 0",
                border: "none",
                background: isActive ? "oklch(72% 0.18 145 / 0.08)" : "transparent",
                color: isActive
                  ? "var(--color-accent)"
                  : item.disabled
                  ? "var(--color-ink-5)"
                  : "var(--color-ink-4)",
                cursor: item.disabled ? "default" : "pointer",
                opacity: item.disabled ? 0.3 : 1,
                transition: "all var(--dur-fast) var(--ease-out)",
              }}
              onMouseEnter={e => {
                if (!item.disabled && !isActive) {
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-2)";
                  (e.currentTarget as HTMLButtonElement).style.background = "oklch(100% 0 0 / 0.04)";
                }
              }}
              onMouseLeave={e => {
                if (!item.disabled && !isActive) {
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--color-ink-4)";
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }
              }}
            >
              {/* Active indicator — left edge bar */}
              {isActive && (
                <div style={{
                  position: "absolute",
                  left: 0, top: "50%",
                  transform: "translateY(-50%)",
                  width: 2, height: 20,
                  borderRadius: "0 2px 2px 0",
                  background: "var(--color-accent)",
                  boxShadow: "0 0 8px var(--color-accent)",
                }} />
              )}
              <Icon size={20} strokeWidth={1.5} />
            </button>
          );
        })}
      </div>

      {/* Bottom — user + settings */}
      <div style={{
        marginTop: "auto",
        display: "flex", flexDirection: "column",
        alignItems: "center", width: "100%",
        gap: 2, paddingBottom: 8,
      }}>
        <button
          title={user ? `signed in as ${user.email}` : "user profile"}
          aria-label="User profile"
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            padding: "10px 0", border: "none", background: "transparent",
            color: "var(--color-ink-4)", cursor: "pointer",
            transition: "color var(--dur-fast) var(--ease-out)",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--color-ink-2)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--color-ink-4)")}
        >
          <UserRound size={19} strokeWidth={1.5} />
        </button>

        {user && (
          <button
            title="sign out"
            onClick={() => signOut()}
            aria-label="Sign out"
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              padding: "10px 0", border: "none", background: "transparent",
              color: "var(--color-ink-4)", cursor: "pointer",
              transition: "color var(--dur-fast) var(--ease-out)",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--color-error)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--color-ink-4)")}
          >
            <LogOut size={18} strokeWidth={1.5} />
          </button>
        )}

        <button
          title="settings"
          aria-label="Settings"
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            padding: "10px 0", border: "none", background: "transparent",
            color: "var(--color-ink-4)", cursor: "pointer",
            transition: "color var(--dur-fast) var(--ease-out)",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--color-ink-2)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--color-ink-4)")}
        >
          <Settings size={19} strokeWidth={1.5} />
        </button>
      </div>
    </nav>
  );
}
