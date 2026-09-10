import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import { LiveDot } from "../ui/LiveDot";
import { getWho, quickLogin, logout } from "../../lib/auth";

export type AdminTab = "overview" | "lots" | "disputes" | "sessions" | "provision";

interface Props {
  activeTab: AdminTab;
  onTabChange: (t: AdminTab) => void;
  connected: boolean;
  mismatchCount?: number;
  overstayCount?: number;
  onAuthChange?: () => void;
  children: ReactNode;
}

export function AdminLayout({
  activeTab,
  onTabChange,
  connected,
  mismatchCount = 0,
  overstayCount = 0,
  onAuthChange,
  children,
}: Props) {
  const who = getWho();

  async function handleQuickAdmin() {
    try {
      await quickLogin("admin");
      onAuthChange?.();
    } catch {
      /* ignore */
    }
  }

  function handleLogout() {
    logout();
    onAuthChange?.();
  }

  const tabs: { id: AdminTab; label: string; icon: string; badge?: number }[] = [
    { id: "overview", label: "Dashboard", icon: "📊" },
    { id: "lots", label: "Live Lot Grid", icon: "🅿️" },
    { id: "disputes", label: "Dispute Desk", icon: "⚖️", badge: mismatchCount },
    { id: "sessions", label: "Sessions & Overdue", icon: "⏱️", badge: overstayCount },
    { id: "provision", label: "Lot Provisioning", icon: "➕" },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col justify-between shrink-0 shadow-xl z-20">
        <div>
          {/* Logo & App Switcher */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 group">
              <span className="text-2xl transition-transform group-hover:scale-110">🏛️</span>
              <div>
                <h1 className="font-extrabold text-base tracking-tight leading-tight group-hover:text-blue-400 transition-colors">
                  Campus Admin
                </h1>
                <p className="text-[11px] text-slate-400 font-medium">Parking Operations</p>
              </div>
            </Link>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Beta
            </span>
          </div>

          {/* Nav items */}
          <nav className="p-3 space-y-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={clsx(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 transform-gpu active:scale-[0.98] cursor-pointer",
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </div>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={clsx(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full",
                        tab.id === "disputes"
                          ? "bg-purple-500/30 text-purple-200 border border-purple-400/40"
                          : "bg-red-500/30 text-red-200 border border-red-400/40 animate-pulse"
                      )}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer: User Profile / Beta Quick Auth & Connection Status */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              <LiveDot connected={connected} />
              {connected ? "Live Realtime" : "Reconnecting..."}
            </span>
            <Link
              to="/field"
              className="text-blue-400 hover:underline text-[11px] font-medium"
              title="Open Field App"
            >
              Open Gate App →
            </Link>
          </div>

          {who?.role === "admin" ? (
            <div className="flex items-center justify-between bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/60">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold font-mono">
                  A
                </div>
                <div className="truncate">
                  <div className="text-xs font-bold text-slate-200 leading-none">{who.name}</div>
                  <div className="text-[10px] text-emerald-400 font-mono mt-0.5">Admin Role</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="text-[11px] text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleQuickAdmin}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 py-2 rounded-xl text-xs font-medium transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>⚡</span>
              <span>1-Click Admin Login</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto max-h-screen p-5 md:p-8 space-y-6">
        {children}
      </main>
    </div>
  );
}
