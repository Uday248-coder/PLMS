import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { SlotTile } from "../components/SlotTile";
import { AuthBar } from "../components/AuthBar";
import { api } from "../lib/api";
import { liveChannel } from "../lib/live";
import type { Lot, Slot, Alert, VehicleType } from "../types";
import { VEHICLE_ICONS } from "../types";

type Filter = "all" | VehicleType;

export default function Guard() {
  const [lotId, setLotId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [plate, setPlate] = useState("");
  const [vtype, setVtype] = useState<VehicleType>("car");
  const [authTick, setAuthTick] = useState(0);
  const liveRef = useRef<{ stop: () => void } | null>(null);

  const load = useCallback(async () => {
    if (!lotId) return;
    try {
      const [s, a] = await Promise.all([
        api<Slot[]>(`/api/lots/${lotId}/slots`),
        api<{ needs_guard_action: Alert[] }>(`/api/lots/${lotId}/alerts`).catch(
          () => ({ needs_guard_action: [] })
        ),
      ]);
      setSlots(s);
      setAlerts(a.needs_guard_action);
    } catch (e: any) {
      setErr("Load failed: " + e.message);
    }
  }, [lotId]);

  useEffect(() => {
    api<Lot[]>("/api/lots")
      .then(async (l) => {
        if (!l.length) {
          await api("/api/lots/default").catch(() => {});
          return api<Lot[]>("/api/lots");
        }
        return l;
      })
      .then((l) => {
        if (l.length && !lotId) setLotId(l[0].id);
      })
      .catch(() => {});
  }, [authTick]);

  useEffect(() => {
    if (!lotId) return;
    load();
    liveRef.current?.stop();
    liveRef.current = liveChannel(`/ws/lot/${lotId}`, () => load(), () => load(), 5000);
    return () => liveRef.current?.stop();
  }, [lotId, load]);

  async function guardAction(action: "confirm" | "deny" | "checkout", sessionId: string) {
    try {
      await api(`/api/guard/${action}`, "POST", { session_id: sessionId });
      setNote(
        action === "deny"
          ? "❌ Denied — slot reopened, sent to admin review queue."
          : `✅ Guard ${action} confirmed.`
      );
      setErr("");
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function manualCheckin() {
    setNote("");
    try {
      await api("/api/checkin", "POST", {
        lot_id: lotId,
        vehicle_type: vtype,
        vehicle_ref: plate,
        flow_type: "guard_managed",
      });
      setNote("✅ Checked in.");
      setErr("");
      load();
    } catch (e: any) {
      setErr("Check-in failed: " + e.message);
    }
  }

  const filtered = slots.filter((s) => filter === "all" || s.vehicle_type === filter);

  return (
    <main className="max-w-6xl mx-auto px-6 py-6 space-y-4 animate-fade-in">
      <AuthBar role="guard" onAuth={() => setAuthTick((t) => t + 1)} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      {note && <p className="text-sm text-emerald-600 font-medium">{note}</p>}

      <div className="grid md:grid-cols-[340px_1fr] gap-5">
        {/* Sidebar */}
        <Card className="p-5 space-y-5 h-fit sticky top-20">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-lg text-slate-800">
                Pending Queue
              </h2>
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {alerts.length || "0"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Self-reported slots waiting for guard confirm or deny.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {alerts.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">
                  Nothing waiting — all clear.
                </p>
              ) : (
                alerts.map((a) => (
                  <div
                    key={a.slot_id}
                    className="bg-slate-50 border border-slate-200 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sm">
                        {a.zone}-{a.number}
                      </span>
                      {a.vehicle_ref && (
                        <span className="text-xs font-mono font-semibold text-slate-600">
                          🚘 {a.vehicle_ref}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mb-2">
                      {a.status.replace(/_/g, " ")}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => guardAction("confirm", a.session)}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => guardAction("deny", a.session)}
                      >
                        Deny
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="font-semibold text-sm text-slate-700 mb-3">
              Manual Check-In
            </h3>
            <div className="flex gap-2 mb-2">
              <Input
                placeholder="Plate"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                className="flex-1"
              />
              <Select
                value={vtype}
                onChange={(e) => setVtype(e.target.value as VehicleType)}
                className="w-32"
              >
                <option value="car">🚗 Car</option>
                <option value="bike">🏍️ Bike</option>
                <option value="truck">🚛 Truck</option>
              </Select>
            </div>
            <Button
              onClick={manualCheckin}
              className="w-full"
              variant="primary"
            >
              Check In
            </Button>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2">
            <h3 className="font-semibold text-xs text-slate-500 uppercase tracking-wider">
              Legend
            </h3>
            {[
              { color: "bg-emerald-200", label: "Available" },
              { color: "bg-amber-200", label: "Reserved" },
              { color: "bg-orange-200", label: "Unverified" },
              { color: "bg-red-200", label: "Occupied" },
              { color: "bg-cyan-200", label: "Leaving" },
              { color: "bg-purple-200", label: "Mismatch" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-2 text-xs text-slate-500">
                <span className={`w-3 h-3 rounded ${l.color}`} />
                {l.label}
              </div>
            ))}
          </div>
        </Card>

        {/* Main Grid */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg text-slate-800">Slot Grid</h2>
            <div className="flex gap-1">
              {(["all", "car", "bike", "truck"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors duration-150 ${
                    filter === f
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {f === "all"
                    ? "All"
                    : `${VEHICLE_ICONS[f]} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map((s) => (
              <SlotTile key={s.id} slot={s}>
                {(s.status === "self_reported" ||
                  s.status === "self_reported_leaving") &&
                  s.session && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => guardAction("confirm", s.session!)}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => guardAction("deny", s.session!)}
                      >
                        Deny
                      </Button>
                    </div>
                  )}
                {s.status === "occupied" && s.session && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => guardAction("checkout", s.session!)}
                  >
                    Check-Out
                  </Button>
                )}
              </SlotTile>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
