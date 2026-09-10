import { Link, useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";

export default function Hub() {
  const navigate = useNavigate();
  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-10 animate-fade-in">
      {/* Hero Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3.5 py-1 rounded-full text-xs font-bold border border-blue-200">
          <span>🚀 Pre-Release Beta Suite</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900">
          Parking Slot Management
        </h1>
        <p className="text-slate-500 text-base sm:text-lg max-w-xl mx-auto font-medium">
          A synchronized, state-machine driven parking system engineered for instant walk-ins, guard verification, and campus oversight.
        </p>
      </div>

      {/* Two Main Production Applications */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* App 1: Field Operations Suite */}
        <Link to="/field" className="group">
          <Card
            hover
            className="p-7 h-full border-slate-200 group-hover:border-emerald-300 group-hover:shadow-lg transition-all space-y-5"
          >
            <div className="flex items-center justify-between">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform">
                🎫
              </div>
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Field Operations
              </span>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-emerald-700 transition-colors">
                Gate & Field App
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                The frontline gate application designed for walk-in drivers and gate attendants. Includes <strong>Driver Kiosk</strong>, <strong>Guard Terminal</strong>, and a <strong>Dual-Booth Split View</strong>.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-600">
              <span>Launch Field Suite →</span>
              <div className="flex gap-2 text-[11px] text-slate-400 font-normal">
                <button
                  type="button"
                  className="hover:text-slate-700 underline cursor-pointer"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/kiosk"); }}
                >
                  Direct Kiosk
                </button>
                <span>·</span>
                <button
                  type="button"
                  className="hover:text-slate-700 underline cursor-pointer"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/guard"); }}
                >
                  Direct Guard
                </button>
              </div>
            </div>
          </Card>
        </Link>

        {/* App 2: Admin Operations Portal */}
        <Link to="/admin" className="group">
          <Card
            hover
            className="p-7 h-full border-slate-200 group-hover:border-blue-300 group-hover:shadow-lg transition-all space-y-5"
          >
            <div className="flex items-center justify-between">
              <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform">
                🏛️
              </div>
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                Management Portal
              </span>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-blue-700 transition-colors">
                Admin Operations App
              </h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Campus-wide capacity analytics, live interactive lot visualizer, dispute mediation desk, active overstay tracking, and dynamic lot provisioning.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600">
              <span>Launch Admin Portal →</span>
              <span className="text-[11px] text-slate-400 font-normal">Facility Control</span>
            </div>
          </Card>
        </Link>
      </div>

      {/* Footer Info */}
      <div className="text-center text-xs text-slate-400 pt-4 flex items-center justify-center gap-4">
        <span>⚡ FastAPI + React State Machine</span>
        <span>·</span>
        <a href="/docs" target="_blank" rel="noreferrer" className="underline hover:text-slate-600">
          API Documentation
        </a>
        <span>·</span>
        <a href="/api/health" target="_blank" rel="noreferrer" className="underline hover:text-slate-600">
          System Health
        </a>
      </div>
    </main>
  );
}
