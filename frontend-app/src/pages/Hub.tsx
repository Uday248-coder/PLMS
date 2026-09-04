import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";

const features = [
  {
    to: "/guard",
    icon: "🛡️",
    title: "Guard Dashboard",
    desc: "Confirm or deny taps in real time. Manual check-in. Filter the lot grid. Live queue with counts.",
    accent: "bg-blue-100 text-blue-700",
    hoverBorder: "hover:border-blue-200",
  },
  {
    to: "/kiosk",
    icon: "🎫",
    title: "Driver / Kiosk",
    desc: "Walk-in flow: pick lot, get slot, park, leave. Big touch targets. Works on gate screens and phones.",
    accent: "bg-emerald-100 text-emerald-700",
    hoverBorder: "hover:border-emerald-200",
  },
  {
    to: "/admin",
    icon: "📊",
    title: "Admin Panel",
    desc: "System occupancy, mismatch review queue, overstays, lot provisioning, full session history.",
    accent: "bg-amber-100 text-amber-700",
    hoverBorder: "hover:border-amber-200",
  },
];

export default function Hub() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-800 mb-3">
          Parking Slot Management
        </h1>
        <p className="text-slate-500 text-lg max-w-xl mx-auto">
          Walk-in ready · no login for drivers · full guard control · admin
          oversight
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {features.map((f) => (
          <Link key={f.to} to={f.to}>
            <Card hover className={`p-6 h-full ${f.hoverBorder}`}>
              <div
                className={`w-12 h-12 ${f.accent} rounded-xl flex items-center justify-center text-xl mb-4`}
              >
                {f.icon}
              </div>
              <h2 className="text-lg font-bold text-slate-800 mb-2">
                {f.title}
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                {f.desc}
              </p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-10 text-center text-sm text-slate-400">
        <a href="/docs" className="underline hover:text-slate-600">
          API docs
        </a>{" "}
        ·{" "}
        <a href="/api/health" className="underline hover:text-slate-600">
          health
        </a>
      </div>
    </main>
  );
}
