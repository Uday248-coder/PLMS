import { Link, useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";

export default function Hub() {
  const navigate = useNavigate();
  return (
    <main className="max-w-5xl mx-auto px-6 py-12 space-y-10 animate-fade-in text-surface-900">
      {/* Hero Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-800 px-4 py-1.5 rounded-full text-xs font-bold border border-primary-200 shadow-sm shadow-primary-500/10">
          <span className="drop-shadow-sm">✨</span>
          <span>Premium Release Suite</span>
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight">
          Parking Slot Management
        </h1>
        <p className="text-surface-500 text-base sm:text-lg max-w-2xl mx-auto font-medium leading-relaxed">
          A synchronized, state-machine driven parking system engineered for instant walk-ins, guard verification, and campus oversight.
        </p>
      </div>

      {/* Two Main Production Applications */}
      <div className="grid md:grid-cols-2 gap-8 pt-4">
        {/* App 1: Field Operations Suite */}
        <Link to="/field" className="group">
          <Card
            hover
            className="p-8 h-full glass border-surface-200 group-hover:border-primary-300 group-hover:-translate-y-1 transition-all duration-300 space-y-6"
          >
            <div className="flex items-center justify-between">
              <div className="w-16 h-16 rounded-2xl bg-surface-100 text-surface-800 border border-surface-200 flex items-center justify-center text-3xl group-hover:scale-105 group-hover:bg-primary-50 group-hover:text-primary-700 transition-all duration-300 shadow-sm">
                🎫
              </div>
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-surface-50 text-surface-600 border border-surface-200 group-hover:bg-primary-50 group-hover:text-primary-700 group-hover:border-primary-200 transition-colors">
                Field Operations
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-3 group-hover:text-primary-700 transition-colors">
                Gate & Field App
              </h2>
              <p className="text-sm text-surface-600 leading-relaxed">
                The frontline gate application designed for walk-in drivers and gate attendants. Includes <strong className="text-surface-900">Driver Kiosk</strong>, <strong className="text-surface-900">Guard Terminal</strong>, and a <strong className="text-surface-900">Dual-Booth Split View</strong>.
              </p>
            </div>

            <div className="pt-4 border-t border-surface-200/60 flex items-center justify-between text-sm font-bold text-surface-500 group-hover:text-primary-600 transition-colors">
              <span>Launch Field Suite →</span>
              <div className="flex gap-3 text-xs text-surface-400 font-normal">
                <button
                  type="button"
                  className="hover:text-primary-600 underline cursor-pointer transition-colors"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/kiosk"); }}
                >
                  Kiosk
                </button>
                <span>·</span>
                <button
                  type="button"
                  className="hover:text-primary-600 underline cursor-pointer transition-colors"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/guard"); }}
                >
                  Guard
                </button>
              </div>
            </div>
          </Card>
        </Link>

        {/* App 2: Admin Operations Portal */}
        <Link to="/admin" className="group">
          <Card
            hover
            className="p-8 h-full glass border-surface-200 group-hover:border-primary-300 group-hover:-translate-y-1 transition-all duration-300 space-y-6"
          >
            <div className="flex items-center justify-between">
              <div className="w-16 h-16 rounded-2xl bg-surface-100 text-surface-800 border border-surface-200 flex items-center justify-center text-3xl group-hover:scale-105 group-hover:bg-primary-50 group-hover:text-primary-700 transition-all duration-300 shadow-sm">
                🏛️
              </div>
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-surface-50 text-surface-600 border border-surface-200 group-hover:bg-primary-50 group-hover:text-primary-700 group-hover:border-primary-200 transition-colors">
                Management Portal
              </span>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-3 group-hover:text-primary-700 transition-colors">
                Admin Operations App
              </h2>
              <p className="text-sm text-surface-600 leading-relaxed">
                Campus-wide capacity analytics, live interactive lot visualizer, dispute mediation desk, active overstay tracking, and dynamic lot provisioning.
              </p>
            </div>

            <div className="pt-4 border-t border-surface-200/60 flex items-center justify-between text-sm font-bold text-surface-500 group-hover:text-primary-600 transition-colors">
              <span>Launch Admin Portal →</span>
              <span className="text-xs text-surface-400 font-normal">Facility Control</span>
            </div>
          </Card>
        </Link>
      </div>

      {/* Footer Info */}
      <div className="text-center text-sm font-medium text-surface-400 pt-8 flex items-center justify-center gap-4">
        <span>⚡ FastAPI + React State Machine</span>
        <span>·</span>
        <a href="/docs" target="_blank" rel="noreferrer" className="underline hover:text-surface-700 transition-colors">
          API Documentation
        </a>
        <span>·</span>
        <a href="/api/health" target="_blank" rel="noreferrer" className="underline hover:text-surface-700 transition-colors">
          System Health
        </a>
      </div>
    </main>
  );
}
