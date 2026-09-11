import { useState, useEffect, useCallback, useRef } from "react";
import { AdminLayout, type AdminTab } from "../components/layout/AdminLayout";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ProgressBar } from "../components/ui/ProgressBar";
import { Badge } from "../components/ui/Badge";
import { SlotTile } from "../components/SlotTile";
import { api } from "../lib/api";
import { getToken } from "../lib/auth";
import { liveChannel } from "../lib/live";
import type { Lot, Slot, StatsOverview, RecentSession, LotOverview, VehicleType } from "../types";
import { VEHICLE_ICONS } from "../types";

export default function Admin() {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotId, setLotId] = useState("");
  const [drillSlots, setDrillSlots] = useState<Slot[]>([]);
  const [slotFilter, setSlotFilter] = useState<"all" | VehicleType>("all");
  const [history, setHistory] = useState<RecentSession[]>([]);
  const [searchPlate, setSearchPlate] = useState("");
  const [provName, setProvName] = useState("");
  const [provLoc, setProvLoc] = useState("");
  const [provCar, setProvCar] = useState(8);
  const [provBike, setProvBike] = useState(4);
  const [provTruck, setProvTruck] = useState(0);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [connected, setConnected] = useState(false);
  const [authTick, setAuthTick] = useState(0);
  const liveRef = useRef<{ stop: () => void } | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const o = await api<StatsOverview>("/api/stats/overview");
      setOverview(o);
      setErr("");
    } catch (e: any) {
      setErr("Overview failed: " + e.message);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const h = await api<RecentSession[]>(
        `/api/sessions/recent?limit=40${lotId ? `&lot_id=${lotId}` : ""}`
      );
      setHistory(h);
    } catch {
      /* ignore */
    }
  }, [lotId]);

  const loadDrill = useCallback(async () => {
    if (!lotId) return;
    try {
      const s = await api<Slot[]>(`/api/lots/${lotId}/slots`);
      setDrillSlots(s);
    } catch {
      /* ignore */
    }
  }, [lotId]);

  const refresh = useCallback(() => {
    loadOverview();
    loadDrill();
    loadHistory();
  }, [loadOverview, loadDrill, loadHistory]);

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
        if (l.length && !lotId) setLotId(l[0].id);
      })
      .catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authTick]);

  useEffect(() => {
    setTimeout(() => refresh(), 0);
    liveRef.current?.stop();
    liveRef.current = liveChannel(
      "/ws/admin",
      () => refresh(),
      () => setConnected(false),
      6000,
      (c) => setConnected(c),
      getToken()
    );
    return () => liveRef.current?.stop();
  }, [refresh]);

  async function provision() {
    setErr("");
    setNote("");
    if (!provName.trim()) {
      setErr("Please provide a lot name");
      return;
    }
    try {
      await api(
        `/api/lots/provision?name=${encodeURIComponent(
          provName.trim()
        )}&location=${encodeURIComponent(provLoc.trim())}&car=${provCar}&bike=${provBike}&truck=${provTruck}`,
        "POST"
      );
      setNote(`✅ Successfully provisioned lot "${provName}".`);
      setProvName("");
      setProvLoc("");
      const l = await api<Lot[]>("/api/lots");
      setLots(l);
      if (l.length) setLotId(l[l.length - 1].id);
      refresh();
      setActiveTab("lots");
    } catch (e: any) {
      setErr(e.message || "Failed to provision lot");
    }
  }

  async function resolveSession(sessionId: string) {
    try {
      await api("/api/admin/resolve", "POST", { session_id: sessionId });
      setNote("✅ Dispute resolved — session marked complete.");
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  const filteredSlots = drillSlots.filter(
    (s) => slotFilter === "all" || s.vehicle_type === slotFilter
  );

  const filteredHistory = history.filter((h) =>
    searchPlate ? (h.vehicle_ref || "").toUpperCase().includes(searchPlate.toUpperCase()) : true
  );

  const totalSlotsCount = overview?.lots.reduce((acc, l) => acc + l.total, 0) ?? 0;
  const totalOccupiedCount = overview?.lots.reduce((acc, l) => acc + l.occupied, 0) ?? 0;
  const totalFreeCount = overview?.lots.reduce((acc, l) => acc + l.free, 0) ?? 0;

  return (
    <AdminLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      connected={connected}
      mismatchCount={overview?.mismatches.length ?? 0}
      overstayCount={overview?.overstays.length ?? 0}
      onAuthChange={() => setAuthTick((t) => t + 1)}
    >
      {/* Toast Feedback */}
      {err && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-between shadow-xs">
          <span>⚠️ {err}</span>
          <button onClick={() => setErr("")} className="text-red-500 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {note && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center justify-between shadow-xs">
          <span>{note}</span>
          <button onClick={() => setNote("")} className="text-emerald-500 font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: OVERVIEW & DASHBOARD */}
      {activeTab === "overview" && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4.5 border-slate-200">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                System Occupancy
              </div>
              <div className="text-3xl font-black text-blue-700 font-mono">
                {overview?.system_pct ?? 0}%
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {totalOccupiedCount} occupied of {totalSlotsCount} bays
              </p>
            </Card>

            <Card className="p-4.5 border-slate-200">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                Available Free Slots
              </div>
              <div className="text-3xl font-black text-emerald-600 font-mono">
                {totalFreeCount}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Ready for assignment</p>
            </Card>

            <Card className="p-4.5 border-slate-200">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                Disputed Sessions
              </div>
              <div className="text-3xl font-black text-purple-600 font-mono">
                {overview?.mismatches.length ?? 0}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Awaiting admin review</p>
            </Card>

            <Card className="p-4.5 border-slate-200">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                Active Overstays
              </div>
              <div className="text-3xl font-black text-red-600 font-mono">
                {overview?.overstays.length ?? 0}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Past booked duration</p>
            </Card>
          </div>

          {/* System Aggregate Progress */}
          <Card className="p-6 border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-bold text-lg text-slate-800">Campus-Wide Capacity</h2>
                <p className="text-xs text-slate-400">Aggregated real-time parking utilization</p>
              </div>
              <span className="text-xl font-black font-mono text-blue-700">
                {overview?.system_pct ?? 0}%
              </span>
            </div>
            <ProgressBar value={overview?.system_pct ?? 0} size="md" />
          </Card>

          {/* Per-Lot Breakdown */}
          <div className="space-y-3">
            <h3 className="font-bold text-base text-slate-800">Facility Breakdown</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(overview?.lots ?? []).map((l: LotOverview) => (
                <Card
                  key={l.lot_id}
                  hover
                  onClick={() => {
                    setLotId(l.lot_id);
                    setActiveTab("lots");
                  }}
                  className="p-4.5 border-slate-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-800 text-sm">{l.name}</span>
                    <span
                      className={`text-xs font-black font-mono px-2 py-0.5 rounded-md ${
                        l.pct > 80
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : l.pct > 50
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      {l.pct}%
                    </span>
                  </div>
                  <ProgressBar value={l.pct} size="sm" />
                  <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100">
                    <span>
                      {l.occupied}/{l.total} occupied
                    </span>
                    <span className="font-bold text-emerald-600">{l.free} free</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE LOT GRID */}
      {activeTab === "lots" && (
        <div className="space-y-5 animate-fade-in">
          <Card className="p-5 border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Select Facility:
                </label>
                <select
                  value={lotId}
                  onChange={(e) => setLotId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} {l.location ? `· ${l.location}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vehicle Type Filter */}
              <div className="flex gap-1.5">
                {(["all", "car", "bike", "truck"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setSlotFilter(f)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                      slotFilter === f
                        ? "bg-slate-900 text-white shadow-sm"
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

            {/* Grid Bays */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filteredSlots.map((s) => (
                <SlotTile key={s.id} slot={s} compact />
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: DISPUTES & MISMATCHES */}
      {activeTab === "disputes" && (
        <div className="space-y-4 animate-fade-in">
          <Card className="p-6 border-slate-200 space-y-4">
            <div>
              <h2 className="font-bold text-lg text-slate-800">Dispute Mediation Desk</h2>
              <p className="text-xs text-slate-500">
                When guards deny a self-reported arrival or departure, the physical slot reopens
                immediately, and the disputed session is preserved here for review.
              </p>
            </div>

            {overview?.mismatches.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm font-medium border border-dashed border-slate-200 rounded-xl">
                ✓ No active disputes — all driver reports match guard confirmations.
              </div>
            ) : (
              <div className="space-y-3">
                {overview?.mismatches.map((m) => (
                  <div
                    key={m.session_id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-purple-50 border border-purple-200 rounded-xl p-4 shadow-2xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-purple-950">
                          Slot: {m.slot_id}
                        </span>
                        <span className="text-xs bg-purple-200/80 text-purple-800 px-2 py-0.5 rounded font-mono">
                          {m.action}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono">
                        Session: {m.session_id} · At: {new Date(m.at).toLocaleString()}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="primary"
                      className="shrink-0"
                      onClick={() => resolveSession(m.session_id)}
                    >
                      ✓ Resolve & Close
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 4: SESSIONS & OVERDUES */}
      {activeTab === "sessions" && (
        <div className="space-y-5 animate-fade-in">
          {/* Overdue Alert Cards */}
          {overview?.overstays && overview.overstays.length > 0 && (
            <Card className="p-5 border-red-200 bg-red-50/50 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-red-700 flex items-center gap-1.5">
                  <span>⏰</span>
                  <span>Active Overstay Alerts</span>
                </h3>
                <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full font-mono">
                  {overview.overstays.length}
                </span>
              </div>

              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                {overview.overstays.map((o) => (
                  <div
                    key={o.session_id}
                    className="bg-white border border-red-200 rounded-xl p-3 shadow-2xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-mono font-bold text-xs text-slate-800">
                        Slot: {o.slot_id}
                      </div>
                      <div className="font-mono font-bold text-sm text-red-600">
                        🚘 {o.vehicle_ref || "Unknown"}
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded">
                      Overdue
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Session History Table */}
          <Card className="p-5 border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <h2 className="font-bold text-base text-slate-800">Recent Session Audit Log</h2>

              <div className="w-64">
                <Input
                  placeholder="Search license plate..."
                  value={searchPlate}
                  onChange={(e) => setSearchPlate(e.target.value)}
                  className="text-xs font-mono font-bold uppercase"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Vehicle Plate</th>
                    <th className="py-2.5 px-3">Slot ID</th>
                    <th className="py-2.5 px-3">Facility</th>
                    <th className="py-2.5 px-3">Flow Type</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Arrival</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-slate-400">
                        No sessions found
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          {h.vehicle_ref || "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600">{h.slot_id}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{h.lot_id}</td>
                        <td className="py-2.5 px-3 text-slate-500">{h.flow}</td>
                        <td className="py-2.5 px-3">
                          <Badge status={h.status} size="sm" />
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                          {h.start ? new Date(h.start).toLocaleTimeString() : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 5: LOT PROVISIONING */}
      {activeTab === "provision" && (
        <div className="max-w-xl animate-fade-in">
          <Card className="p-6 border-slate-200 space-y-4 shadow-sm">
            <div>
              <h2 className="font-bold text-lg text-slate-800">Provision New Parking Lot</h2>
              <p className="text-xs text-slate-500">
                Instantly provision a new lot facility without database scripts or server restarts.
              </p>
            </div>

            <div className="space-y-3">
              <Input
                label="Facility Name"
                placeholder="e.g. South Campus Lot D"
                value={provName}
                onChange={(e) => setProvName(e.target.value)}
              />

              <Input
                label="Location / Landmark"
                placeholder="e.g. Near Science Block Gate 4"
                value={provLoc}
                onChange={(e) => setProvLoc(e.target.value)}
              />

              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Car Bays (Zone A)"
                  type="number"
                  min="0"
                  max="100"
                  value={provCar}
                  onChange={(e) => setProvCar(Number(e.target.value))}
                />

                <Input
                  label="Bike Bays (Zone B)"
                  type="number"
                  min="0"
                  max="100"
                  value={provBike}
                  onChange={(e) => setProvBike(Number(e.target.value))}
                />

                <Input
                  label="Truck/Van (Zone C)"
                  type="number"
                  min="0"
                  max="50"
                  value={provTruck}
                  onChange={(e) => setProvTruck(Number(e.target.value))}
                />
              </div>

              <div className="pt-2">
                <Button onClick={provision} size="lg" className="w-full" variant="primary">
                  ⚡ Provision Facility Now
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </AdminLayout>
  );
}
