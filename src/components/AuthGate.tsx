import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { api } from "../api";

/** Affiche l'écran de code d'accès quand le serveur l'exige. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "login">("loading");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .authStatus()
      .then((s) => setState(!s.required || s.authenticated ? "ok" : "login"))
      .catch(() => setState("ok"));
    const onUnauthorized = () => setState("login");
    window.addEventListener("examia:unauthorized", onUnauthorized);
    return () => window.removeEventListener("examia:unauthorized", onUnauthorized);
  }, []);

  if (state === "loading") return null;
  if (state === "ok") return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(code);
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form className="card card-pad" style={{ width: "100%", maxWidth: 380, animation: "pop .3s var(--ease)" }} onSubmit={submit}>
        <div className="brand" style={{ padding: "0 0 20px" }}>
          <div className="brand-mark">E</div>
          <div>
            <div className="brand-name">EXAMIA</div>
            <div className="brand-tag">Préparation aux examens</div>
          </div>
        </div>
        <h1 className="display" style={{ fontSize: 24 }}>Bienvenue</h1>
        <p className="small muted" style={{ margin: "6px 0 20px" }}>Saisissez votre code d'accès pour continuer.</p>
        <div className="field">
          <label className="label" htmlFor="code">Code d'accès</label>
          <div style={{ position: "relative" }}>
            <Lock size={15} style={{ position: "absolute", left: 12, top: 11, color: "var(--text-3)" }} />
            <input id="code" className="input" type="password" autoFocus autoComplete="current-password" style={{ paddingLeft: 36 }} value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          {error && <div className="small" style={{ color: "var(--bad)" }}>{error}</div>}
        </div>
        <button className="btn btn-primary btn-lg btn-block mt-16" disabled={busy || !code}>
          {busy ? <span className="spinner" /> : <>Se connecter <ArrowRight /></>}
        </button>
      </form>
    </div>
  );
}
