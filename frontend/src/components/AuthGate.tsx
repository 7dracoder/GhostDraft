// AuthGate: blocks access to the app shell until the user is authenticated.
// Terminal-theme login screen — phosphor-green accent, monospace labels, scanline bg.
import { useState, type FormEvent } from "react";
import { ShieldCheck, Loader2, Terminal } from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

// Google "G" logo as an inline SVG — avoids an external image dependency.
function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

// Renders a centered login/signup card; once authenticated, renders children.
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupDone, setSignupDone] = useState(false);

  if (loading) {
    return (
      <div style={{
        display: "flex", height: "100vh", width: "100vw",
        alignItems: "center", justifyContent: "center",
        background: "var(--color-paper)",
      }}>
        <Loader2 size={18} style={{ color: "var(--color-accent)", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (user) return <>{children}</>;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    if (mode === "signin") {
      const err = await signIn(email, password);
      if (err) setError(err);
    } else {
      const err = await signUp(email, password);
      if (err) { setError(err); } else { setSignupDone(true); }
    }
    setSubmitting(false);
  }

  // Initiate Google OAuth redirect via Supabase.
  async function handleGoogle() {
    setGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) { setError(error.message); setGoogleLoading(false); }
  }

  return (
    <div style={{
      display: "flex", height: "100vh", width: "100vw",
      alignItems: "center", justifyContent: "center",
      background: "var(--color-paper)",
      backgroundImage: `
        repeating-linear-gradient(0deg, transparent, transparent 2px, oklch(100% 0 0 / 0.007) 2px, oklch(100% 0 0 / 0.007) 4px),
        radial-gradient(ellipse 900px 600px at 50% 40%, oklch(72% 0.18 145 / 0.05) 0%, transparent 60%)
      `,
      fontFamily: "var(--font-sans)",
    }}>
      <div style={{ width: "100%", maxWidth: 360, padding: "0 16px" }}>

        {/* Logo + wordmark */}
        <div style={{ marginBottom: 32, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "var(--radius-md)",
            background: "oklch(72% 0.18 145 / 0.12)",
            border: "1px solid var(--color-accent-border)",
            boxShadow: "0 0 20px oklch(72% 0.18 145 / 0.12)",
            color: "var(--color-accent)",
            flexShrink: 0,
          }}>
            <Terminal size={16} />
          </div>
          <div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--color-ink)",
              letterSpacing: "0.04em",
            }}>
              GhostDraft
            </div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--color-accent-dim)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              marginTop: 1,
            }}>
              Clinical privacy workspace
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--color-border)",
          background: "linear-gradient(180deg, oklch(13% 0.010 240 / 0.96), oklch(11% 0.009 240 / 0.96))",
          padding: "24px",
          boxShadow: "0 32px 80px oklch(0% 0 0 / 0.55), inset 0 1px 0 oklch(100% 0 0 / 0.04)",
        }}>

          {/* Google OAuth */}
          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8, padding: "9px 16px", marginBottom: 16,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-strong)",
              background: "oklch(100% 0 0 / 0.04)",
              color: "var(--color-ink-2)",
              fontSize: "var(--text-base)",
              fontFamily: "var(--font-sans)",
              cursor: "pointer",
              transition: "background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)",
              opacity: googleLoading ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "oklch(100% 0 0 / 0.07)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(100% 0 0 / 0.14)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "oklch(100% 0 0 / 0.04)";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-strong)";
            }}
          >
            {googleLoading
              ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              : <GoogleIcon />}
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-ink-4)", letterSpacing: "0.08em" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
          </div>

          {/* Mode toggle */}
          <div style={{
            display: "flex", gap: 2, padding: 3, marginBottom: 20,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: "oklch(9% 0.008 240)",
          }}>
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setSignupDone(false); }}
                style={{
                  flex: 1, padding: "7px 0",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: mode === m ? "oklch(16% 0.011 240)" : "transparent",
                  color: mode === m ? "var(--color-ink)" : "var(--color-ink-4)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-sm)",
                  fontWeight: mode === m ? 500 : 400,
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  transition: "all var(--dur-fast) var(--ease-out)",
                  boxShadow: mode === m ? "inset 0 1px 0 oklch(100% 0 0 / 0.05)" : "none",
                }}
              >
                {m === "signin" ? "sign_in" : "create_account"}
              </button>
            ))}
          </div>

          {/* Success state */}
          {signupDone ? (
            <div style={{
              borderRadius: "var(--radius-md)",
              border: "1px solid oklch(72% 0.18 145 / 0.25)",
              background: "oklch(72% 0.18 145 / 0.08)",
              padding: "12px 14px",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-sm)",
              color: "var(--color-accent)",
              lineHeight: 1.6,
            }}>
              ✓ Account created. Check your email to confirm, then sign in.
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Email */}
              <div>
                <label style={{
                  display: "block", marginBottom: 6,
                  fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)",
                  fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "var(--color-ink-3)",
                }}>
                  email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "9px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    background: "oklch(9% 0.008 240)",
                    color: "var(--color-ink)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-base)",
                    outline: "none",
                    transition: "border-color var(--dur-fast) var(--ease-out)",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = "var(--color-accent-border)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "var(--color-border)")}
                />
              </div>

              {/* Password */}
              <div>
                <label style={{
                  display: "block", marginBottom: 6,
                  fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)",
                  fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "var(--color-ink-3)",
                }}>
                  password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={6}
                  placeholder="••••••••"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "9px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    background: "oklch(9% 0.008 240)",
                    color: "var(--color-ink)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-base)",
                    outline: "none",
                    transition: "border-color var(--dur-fast) var(--ease-out)",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = "var(--color-accent-border)")}
                  onBlur={e => (e.currentTarget.style.borderColor = "var(--color-border)")}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  borderRadius: "var(--radius-md)",
                  border: "1px solid oklch(65% 0.18 22 / 0.30)",
                  background: "oklch(18% 0.08 22 / 0.60)",
                  padding: "9px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-sm)",
                  color: "var(--color-error)",
                  lineHeight: 1.5,
                }}>
                  ✗ {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  marginTop: 4,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "10px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--color-accent-border)",
                  background: "oklch(72% 0.18 145 / 0.12)",
                  color: "var(--color-accent)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-base)",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.5 : 1,
                  transition: "all var(--dur-fast) var(--ease-out)",
                  boxShadow: "0 0 20px oklch(72% 0.18 145 / 0.08)",
                }}
                onMouseEnter={e => {
                  if (!submitting) {
                    (e.currentTarget as HTMLButtonElement).style.background = "oklch(72% 0.18 145 / 0.20)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 28px oklch(72% 0.18 145 / 0.18)";
                  }
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "oklch(72% 0.18 145 / 0.12)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 20px oklch(72% 0.18 145 / 0.08)";
                }}
              >
                {submitting
                  ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                  : <ShieldCheck size={13} />}
                {mode === "signin" ? "authenticate()" : "create_account()"}
              </button>
            </form>
          )}
        </div>

        {/* Footer note */}
        <p style={{
          marginTop: 20, textAlign: "center",
          fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)",
          color: "var(--color-ink-4)", letterSpacing: "0.06em",
        }}>
          // access restricted to authorised clinical staff
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
