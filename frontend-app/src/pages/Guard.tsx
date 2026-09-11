import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { SlotTile } from "../components/SlotTile";
import { AuthBar } from "../components/AuthBar";
import { api } from "../lib/api";
import { liveChannel } from "../lib/live";
import type { Lot, Slot, Alert, OverdueAlert, VehicleType } from "../types";
import { VEHICLE_ICONS } from "../types";

type Filter = "all" | VehicleType;

function haptic(duration = 30) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(duration);
    } catch {
      /* ignore */
    }
  }
}

interface Props {
  selectedLotId?: string;
  onLotSelect?: (id: string) => void;
  compact?: boolean;
}

export default function Guard({ selectedLotId, onLotSelect, compact = false }: Props) {
  const [internalLotId, setInternalLotId] = useState("");
  const [lots, setLots] = useState<Lot[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [overdueAlerts, setOverdueAlerts] = useState<OverdueAlert[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [plate, setPlate] = useState("");
  const [vtype, setVtype] = useState<VehicleType>("car");
  const [authTick, setAuthTick] = useState(0);
  const liveRef = useRef<{ stop: () => void } | null>(null);

  const activeLotId = selectedLotId || internalLotId;

  const setLot = (id: string) => {
    setInternalLotId(id);
    onLotSelect?.(id);
  };

  const load = useCallback(async () => {
    if (!activeLotId) return;
    try {
      const [s, a] = await Promise.all([
        api<Slot[]>(`/api/lots/${activeLotId}/slots`),
        api<{ needs_guard_action: Alert[]; overdue?: OverdueAlert[] }>(
          `/api/lots/${activeLotId}/alerts`
        ).catch(() => ({ needs_guard_action: [], overdue: [] })),
      ]);
      setSlots(s);
      setAlerts(a.needs_guard_action);
      setOverdueAlerts(a.overdue ?? []);
    } catch (e: any) {
      setErr("Load failed: " + e.message);
    }
  }, [activeLotId]);

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
        setLots(l);
        if (l.length && !activeLotId) setLot(l[0].id);
      })
      .catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authTick]);

  useEffect(() => {
    if (!activeLotId) return;
    setTimeout(() => load(), 0);
    liveRef.current?.stop();
    liveRef.current = liveChannel(`/ws/lot/${activeLotId}`, () => load(), () => load(), 5000);
    return () => liveRef.current?.stop();
  }, [activeLotId, load]);

  async function guardAction(action: "confirm" | "deny" | "checkout", sessionId: string) {
    haptic(action === "deny" ? 80 : 35);
    try {
      await api(`/api/guard/${action}`, "POST", { session_id: sessionId });
      setNote(
        action === "deny"
          ? "❌ Denied — slot reopened, flagged in admin review desk."
          : `✅ Guard ${action} confirmed.`
      );
      setErr("");
      load();
    } catch (e: any) {
      setErr(e.message);
      haptic(100);
    }
  }

  async function manualCheckin() {
    setNote("");
    const cleanPlate = plate.trim().toUpperCase();
    if (!cleanPlate) {
      setErr("Enter a vehicle plate number");
      return;
    }
    haptic(40);
    try {
      await api("/api/checkin", "POST", {
        lot_id: activeLotId,
        vehicle_type: vtype,
        vehicle_ref: cleanPlate,
        flow_type: "guard_managed",
      });
      setNote(`✅ Manually parked ${cleanPlate}.`);
      setPlate("");
      setErr("");
      load();
    } catch (e: any) {
      setErr("Check-in failed: " + e.message);
      haptic(100);
    }
  }

  const filtered = slots.filter((s) => filter === "all" || s.vehicle_type === filter);
  const freeCount = slots.filter((s) => s.status === "free").length;
  const occupiedCount = slots.filter((s) => s.status === "occupied").length;

  return (
    <div className="space-y-4 animate-fade-in">
      {!compact && <AuthBar role="guard" onAuth={() => setAuthTick((t) => t + 1)} />}

      {/* Lot Status Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Active Lot:
          </label>
          <select
            value={activeLotId}
            onChange={(e) => setLot(e.target.value)}
            className="bg-slate-50 border border-slate-300 font-bold text-slate-800 text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} {l.location ? `· ${l.location}` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Capacity Pills */}
        <div className="flex items-center gap-2 text-xs font-bold font-mono">
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg">
            {freeCount} Free
          </span>
          <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg">
            {occupiedCount} Occupied
          </span>
          <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg">
            {slots.length} Total
          </span>
        </div>
      </div>

      {err && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center justify-between">
          <span>⚠️ {err}</span>
          <button onClick={() => setErr("")} className="text-red-500 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {note && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center justify-between">
          <span>{note}</span>
          <button onClick={() => setNote("")} className="text-emerald-500 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      <div className={compact ? "space-y-4" : "grid md:grid-cols-[330px_1fr] gap-5"}>
        {/* Sidebar / Top Section: Pending Queue & Overdues */}
        <div className="space-y-4">
          {/* Pending Verification Queue */}
          <Card className="p-4.5 space-y-4 border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-slate-800">Pending Queue</h2>
                <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full font-mono">
                  {alerts.length}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Auto-refreshes</span>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {alerts.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs font-medium border border-dashed border-slate-200 rounded-xl">
                  ✓ No pending vehicle requests
                </div>
              ) : (
                alerts.map((a) => (
                  <div
                    key={a.slot_id}
                    className="bg-slate-50 border border-slate-200/90 rounded-xl p-3 shadow-2xs transition-all"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono font-black text-base text-slate-800">
                        {a.zone}-{a.number}
                      </span>
                      {a.vehicle_ref && (
                        <span className="text-xs font-mono font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
                          🚘 {a.vehicle_ref}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 font-medium mb-2.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      <span>{a.status === "self_reported" ? "Driver arrived & parked" : "Driver leaving bay"}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => guardAction("confirm", a.session)}
                      >
                        ✓ Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => guardAction("deny", a.session)}
                      >
                        ✕ Deny
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Overdue Alert Watchlist */}
          {overdueAlerts.length > 0 && (
            <Card className="p-4 border-red-200 bg-red-50/40 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-sm text-red-700 flex items-center gap-1.5">
                    <span>⏰</span>
                    <span>Overdue Vehicles</span>
                  </h2>
                  <span className="bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full font-mono animate-pulse">
                    {overdueAlerts.length}
                  </span>
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {overdueAlerts.map((o) => (
                  <div
                    key={o.session_id}
                    className="bg-white border border-red-200 rounded-xl p-2.5 shadow-2xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-mono font-bold text-sm text-slate-800">
                        {o.zone}-{o.number}
                      </div>
                      <div className="text-xs font-mono font-bold text-red-600">
                        🚘 {o.vehicle_ref || "Unknown"}
                      </div>
                    </div>
                    <span className="text-xs font-extrabold text-red-600 bg-red-50 px-2 py-1 rounded-lg border border-red-200 font-mono">
                      +{o.minutes_over}m over
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Manual Gate Check-In */}
          <Card className="p-4 space-y-3 border-slate-200">
            <h3 className="font-bold text-xs text-slate-600 uppercase tracking-wider">
              Manual Check-In
            </h3>
            <div className="flex gap-2">
              <Input
                placeholder="Plate #"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                className="font-mono font-bold uppercase flex-1"
              />
              <Select
                value={vtype}
                onChange={(e) => setVtype(e.target.value as VehicleType)}
                className="w-28 text-xs font-semibold"
              >
                <option value="car">🚗 Car</option>
                <option value="bike">🏍️ Bike</option>
                <option value="truck">🚛 Truck</option>
              </Select>
            </div>
            <Button onClick={manualCheckin} className="w-full" size="sm" variant="primary">
              ⚡ Check In Vehicle
            </Button>
          </Card>
        </div>

        {/* Main Slot Grid */}
        <Card className="p-5 border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <h2 className="font-bold text-lg text-slate-800">Lot Slot Visualizer</h2>

            {/* Filter Pills with Wyatt Feaster tactile buttons */}
            <div className="flex gap-1.5">
              {(["all", "car", "bike", "truck"] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    haptic(15);
                    setFilter(f);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 transform-gpu active:scale-95 cursor-pointer ${
                    filter === f
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {f === "all"
                    ? "All Vehicles"
                    : `${VEHICLE_ICONS[f]} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
                </button>
              ))}
            </div>
          </div>

          {/* Grid bays */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((s) => (
              <SlotTile key={s.id} slot={s} compact={compact}>
                {(s.status === "self_reported" || s.status === "self_reported_leaving") &&
                  s.session && (
                    <div className="flex gap-1.5 mt-2">
                      <Button
                        size="sm"
                        variant="success"
                        className="flex-1 py-1"
                        onClick={() => guardAction("confirm", s.session!)}
                      >
                        ✓
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        className="flex-1 py-1"
                        onClick={() => guardAction("deny", s.session!)}
                      >
                        ✕
                      </Button>
                    </div>
                  )}

                {s.status === "occupied" && s.session && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full mt-2 text-xs py-1"
                    onClick={() => guardAction("checkout", s.session!)}
                  >
                    Check Out
                  </Button>
                )}
              </SlotTile>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
