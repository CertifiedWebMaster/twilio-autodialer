import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { UserButton } from "@clerk/react";
import { History, ListChecks, PhoneOutgoing, Settings, Users } from "lucide-react";
import { errMsg, useApi } from "../lib/api";
import { MeContext } from "../lib/me";

const NAV = [
  { to: "/", label: "Dialer", icon: PhoneOutgoing, end: true },
  { to: "/lists", label: "Lists", icon: ListChecks },
  { to: "/calls", label: "Calls", icon: History },
  { to: "/team", label: "Team", icon: Users, admin: true },
  { to: "/settings", label: "Settings", icon: Settings, admin: true },
];

function NavItem({ item, compact }) {
  const Icon = item.icon;
  return (
    <NavLink to={item.to} end={item.end} data-testid={`nav-${item.label.toLowerCase()}`}
      className={({ isActive }) => `flex items-center gap-3 rounded-xl transition-colors ${compact ? "flex-col gap-1 px-3 py-2 text-[11px]" : "px-3 py-2.5 text-sm"} ${isActive ? "bg-accent/15 text-white" : "text-slate-400 hover:text-slate-100 hover:bg-white/5"}`}>
      <Icon size={compact ? 18 : 17} />{item.label}
    </NavLink>
  );
}

export default function Layout() {
  const api = useApi();
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api.get("/me").then((r) => setMe(r.data)).catch((e) => setError(errMsg(e))); }, [api]);

  if (error) return <div className="p-10 text-rose-300" data-testid="me-error">{error}</div>;
  if (!me) return <div className="p-10 text-slate-500" data-testid="app-loading">Loading workspace…</div>;
  const nav = NAV.filter((n) => !n.admin || me.role === "admin");

  return (
    <MeContext.Provider value={me}>
      <div className="min-h-screen lg:pl-64 pb-20 lg:pb-0">
        <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-white/[0.06] bg-ink/80 backdrop-blur-xl p-5">
          <div className="flex items-center gap-2 px-2 mb-10">
            <span className="grid place-items-center h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-400"><PhoneOutgoing size={16} /></span>
            <span className="font-display text-xl font-bold text-white tracking-tight">AutoDialer</span>
          </div>
          <nav className="flex flex-col gap-1">{nav.map((n) => <NavItem key={n.to} item={n} />)}</nav>
          <div className="mt-auto flex items-center gap-3 rounded-xl border border-white/[0.06] p-3" data-testid="current-user">
            <UserButton />
            <div className="min-w-0">
              <div className="text-sm text-white truncate">{me.name}</div>
              <div className="label !text-[10px]" data-testid="current-user-role">{me.role}</div>
            </div>
          </div>
        </aside>
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-ink/90 backdrop-blur-xl sticky top-0 z-30">
          <span className="font-display text-lg font-bold text-white">AutoDialer</span>
          <UserButton />
        </header>
        <main className="p-4 md:p-8 max-w-[1400px]"><Outlet /></main>
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex justify-around border-t border-white/[0.06] bg-ink/95 backdrop-blur-xl py-1">
          {nav.map((n) => <NavItem key={n.to} item={n} compact />)}
        </nav>
      </div>
    </MeContext.Provider>
  );
}
