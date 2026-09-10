import { clsx } from "clsx";
import { Link } from "react-router-dom";
import { LiveDot } from "../ui/LiveDot";
import { getWho, quickLogin, logout } from "../../lib/auth";

export type FieldMode = "kiosk" | "guard" | "dual";

interface Props {
  mode: FieldMode;
  onModeChange: (m: FieldMode) => void;
  connected: boolean;
  onAuthChange?: () => void;
}

export function FieldLayout({ mode, onModeChange, connected, onAuthChange }: Props) {
  const who = getWho();

  async function handleQuickGuard() {
    try {
      await quickLogin("guard");
      onAuthChange?.();
    } catch {
      /* ignore */
    }
  }

  function handleLogout() {
    logout();
    onAuthChange?.();
  }

  return (
    <header className="sticky top-0 z-50 bg-slate-900 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-4">
      {/* Brand & Hub Link */}
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="font-extrabold text-lg tracking-tight hover:text-blue-400 transition-colors flex items-center gap-1.5"
          title="Back to System Hub"
        >
          <span>🅿️</span>
          <span className="hidden sm:inline">Field Ops</span>
        </Link>
        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
          Beta
        </span>
      </div>

      {/* Mode Switcher (Tactile Pills) */}
      <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700/60 shadow-inner">
        <button
          type="button"
          onClick={() => onModeChange("kiosk")}
          className={clsx(
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 transform-gpu active:scale-95 flex items-center gap-1.5 cursor-pointer",
            mode === "kiosk"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-slate-300 hover:text-white hover:bg-slate-700/60"
          )}
        >
          <span>🎫</span>
          <span className="hidden md:inline">Driver Kiosk</span>
        </button>

        <button
          type="button"
          onClick={() => onModeChange("guard")}
          className={clsx(
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 transform-gpu active:scale-95 flex items-center gap-1.5 cursor-pointer",
            mode === "guard"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-300 hover:text-white hover:bg-slate-700/60"
          )}
        >
          <span>🛡️</span>
          <span className="hidden md:inline">Guard Terminal</span>
        </button>

        <button
          type="button"
          onClick={() => onModeChange("dual")}
          className={clsx(
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 transform-gpu active:scale-95 flex items-center gap-1.5 cursor-pointer",
            mode === "dual"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-300 hover:text-white hover:bg-slate-700/60"
          )}
          title="Split-screen dual booth mode for simultaneous kiosk & guard preview"
        >
          <span>◫</span>
          <span className="hidden md:inline">Dual Booth</span>
        </button>
      </div>

      {/* Right Controls: Quick Auth & Live Connection */}
      <div className="flex items-center gap-3">
        {mode !== "kiosk" && (
          <div className="hidden sm:flex items-center gap-2 text-xs">
            {who?.role === "guard" ? (
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-mono">👤 {who.name}</span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-red-400 text-[11px] underline cursor-pointer"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleQuickGuard}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs px-2.5 py-1 rounded-lg transition-all active:scale-95 cursor-pointer"
                title="1-Click Beta Login as Guard"
              >
                ⚡ Guard Login
              </button>
            )}
          </div>
        )}

        <div className="flex items-center pl-1 border-l border-slate-700/60">
          <LiveDot connected={connected} />
        </div>
      </div>
    </header>
  );
}
