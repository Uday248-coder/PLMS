import { NavLink, Outlet, useLocation } from "react-router-dom";
import { clsx } from "clsx";
import { LiveDot } from "../ui/LiveDot";

interface HeaderProps {
  connected: boolean;
}

const navItems = [
  { to: "/field", label: "Field Suite" },
  { to: "/admin", label: "Admin Portal" },
  { to: "/kiosk", label: "Driver Kiosk" },
  { to: "/guard", label: "Guard Terminal" },
];

export function Header({ connected }: HeaderProps) {
  const location = useLocation();
  // Don't show default top header if already inside the dedicated Admin or Field layout
  const isFullAppView = location.pathname.startsWith("/admin") || location.pathname.startsWith("/field");

  if (isFullAppView) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 bg-slate-900 text-white px-5 py-3 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-4">
        <NavLink
          to="/"
          className="font-black text-lg tracking-tight hover:text-blue-400 transition-colors flex items-center gap-2"
        >
          <span>🅿️</span>
          <span>Parking OS</span>
        </NavLink>

        <nav className="hidden sm:flex items-center gap-1 ml-2">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                clsx(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-95",
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <LiveDot connected={connected} />
      </div>
    </header>
  );
}

export function Layout({ connected }: HeaderProps) {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Header connected={connected} />
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
