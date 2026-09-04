import { NavLink, Outlet } from "react-router-dom";
import { clsx } from "clsx";
import { LiveDot } from "../ui/LiveDot";

interface HeaderProps {
  connected: boolean;
}

const navItems = [
  { to: "/guard", label: "Guard" },
  { to: "/kiosk", label: "Driver" },
  { to: "/admin", label: "Admin" },
];

export function Header({ connected }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-slate-900 text-white px-6 py-3 flex items-center gap-3 shadow-lg">
      <NavLink
        to="/"
        className="font-extrabold text-xl tracking-tight hover:opacity-90 transition-opacity"
      >
        🅿️ Parking
      </NavLink>
      <nav className="flex gap-1 ml-4">
        {navItems.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              clsx(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-700 hover:text-white"
              )
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto">
        <LiveDot connected={connected} />
      </div>
    </header>
  );
}

export function Layout({ connected }: HeaderProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header connected={connected} />
      <Outlet />
    </div>
  );
}
