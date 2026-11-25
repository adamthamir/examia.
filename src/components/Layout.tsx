import { NavLink, Outlet, Link } from "react-router-dom";
import { BookOpen, History, LayoutDashboard, ListChecks, Settings, Sparkles } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks";

const NAV = [
  { to: "/", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard, end: true },
  { to: "/bibliotheque", label: "Bibliothèque", short: "Cours", icon: BookOpen },
  { to: "/generer", label: "Générer un QCM", short: "Générer", icon: Sparkles },
  { to: "/qcm", label: "Mes QCM", short: "QCM", icon: ListChecks },
  { to: "/historique", label: "Historique", short: "Résultats", icon: History },
];

export function Brand() {
  return (
    <Link to="/" className="brand">
      <div className="brand-mark">E</div>
      <div>
        <div className="brand-name">EXAMIA</div>
        <div className="brand-tag">Préparation aux examens</div>
      </div>
    </Link>
  );
}

export function Layout() {
  const { data: ai } = useAsync(() => api.aiStatus(), []);
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon /> {label}
            </NavLink>
          ))}
          <div className="nav-section">Compte</div>
          <NavLink to="/parametres">
            <Settings /> Paramètres
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <Link to="/parametres" className="ai-pill">
            <span className={`dot ${ai?.configured ? "on" : ai ? "demo" : ""}`} />
            {ai ? (ai.configured ? "IA connectée" : "Mode démo — sans IA") : "…"}
          </Link>
        </div>
      </aside>
      <div className="main">
        <header className="mobile-top">
          <Brand />
          <Link to="/parametres" className="btn btn-ghost btn-icon" aria-label="Paramètres">
            <Settings />
          </Link>
        </header>
        <Outlet />
      </div>
      <nav className="tabbar">
        {NAV.map(({ to, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon /> {short}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
