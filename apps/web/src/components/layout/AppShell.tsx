import type { ReactNode } from "react";
import { Feather } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export function AppShell({ sidebar, mobileNav, children }: { sidebar: ReactNode; mobileNav?: ReactNode; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="iw-shell">
      <a href="#iw-main-content" className="iw-skip-link">
        Skip to content
      </a>
      <header className="iw-topbar">
        <button className="iw-brand" style={{ fontSize: "1.125rem", marginBottom: 0 }} onClick={() => navigate("/dashboard")}>
          <Feather size={18} color="var(--color-accent)" /> Inkwell
        </button>
      </header>
      <aside className="iw-sidebar ui" aria-label="Primary">
        <Link to="/dashboard" className="iw-brand iw-display">
          <Feather size={20} color="var(--color-accent)" /> Inkwell
        </Link>
        {sidebar}
      </aside>
      <main className="iw-main" id="iw-main-content">
        {children}
      </main>
      {mobileNav && (
        <nav className="iw-mobile-nav" aria-label="Primary">
          {mobileNav}
        </nav>
      )}
    </div>
  );
}

export function NavItem({ to, icon, label, active }: { to: string; icon: ReactNode; label: string; active?: boolean }) {
  return (
    <Link to={to} className={`iw-navitem ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
      {icon}
      {label}
    </Link>
  );
}
