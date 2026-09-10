import { useState, useEffect } from "react";
import { FieldLayout, type FieldMode } from "../components/layout/FieldLayout";
import Kiosk from "./Kiosk";
import Guard from "./Guard";
import { liveChannel } from "../lib/live";
import { getToken } from "../lib/auth";

export default function FieldSuite() {
  const [mode, setMode] = useState<FieldMode>("kiosk");
  const [connected, setConnected] = useState(false);
  const [authTick, setAuthTick] = useState(0);

  useEffect(() => {
    const ch = liveChannel(
      "/ws/admin",
      () => {},
      () => setConnected(false),
      8000,
      (c) => setConnected(c),
      getToken()
    );
    return () => ch.stop();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <FieldLayout
        mode={mode}
        onModeChange={setMode}
        connected={connected}
        onAuthChange={() => setAuthTick((t) => t + 1)}
      />

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        {mode === "kiosk" && (
          <div className="max-w-2xl mx-auto animate-fade-in">
            <Kiosk />
          </div>
        )}

        {mode === "guard" && (
          <div className="animate-fade-in" key={`guard-${authTick}`}>
            <Guard />
          </div>
        )}

        {mode === "dual" && (
          <div className="animate-fade-in space-y-3">
            <div className="bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-semibold p-2.5 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>◫</span>
                <span>
                  <strong>Dual Booth Split Mode</strong>: Left side simulates the Driver Kiosk screen; right side simulates the Guard's terminal.
                </span>
              </div>
              <span className="text-[11px] font-mono text-indigo-600">Simultaneous Live Demo</span>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 items-start">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-2 flex items-center justify-between">
                  <span>🎫 Driver Kiosk Screen</span>
                  <span className="text-emerald-600 font-mono text-[11px]">Gate Entrance</span>
                </div>
                <Kiosk />
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 border-b border-slate-100 pb-2 flex items-center justify-between">
                  <span>🛡️ Guard Gate Terminal</span>
                  <span className="text-blue-600 font-mono text-[11px]">Gate Attendant</span>
                </div>
                <Guard compact />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
