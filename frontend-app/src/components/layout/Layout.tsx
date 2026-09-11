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
  const isFullAppView = location.pathname.startsWith("/admin") || location.pathname.startsWith("/field");

  if (isFullAppView) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 glass px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <NavLink
          to="/"
          className="font-extrabold text-xl tracking-tight text-surface-900 hover:text-primary-600 transition-colors flex items-center gap-2"
        >
          <span className="text-2xl drop-shadow-sm">🅿️</span>
          <span>Parking OS</span>
        </NavLink>

        <nav className="hidden md:flex items-center gap-2 border-l border-surface-200 pl-6">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                clsx(
                  "px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 active:scale-95",
                  isActive
                    ? "bg-primary-500 text-white shadow-md shadow-primary-500/20 translate-y-[-1px]"
                    : "text-surface-800 hover:bg-surface-100 hover:text-primary-700"
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <LiveDot connected={connected} />
      </div>
    </header>
  );
}

export function Layout({ connected }: HeaderProps) {
  return (
    <div className="min-h-screen flex flex-col font-sans animate-fade-in text-surface-900">
      <Header connected={connected} />
      <div className="flex-1 w-full max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8">
        <Outlet />
      </div>
    </div>
  );
}
