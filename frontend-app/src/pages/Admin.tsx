import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ProgressBar } from "../components/ui/ProgressBar";
import { Badge } from "../components/ui/Badge";
import { SlotTile } from "../components/SlotTile";
import { AuthBar } from "../components/AuthBar";
import { api } from "../lib/api";
import { liveChannel } from "../lib/live";
import type {
  Lot,
  Slot,
  StatsOverview,
  RecentSession,
  LotOverview,
} from "../types";

export default function Admin() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotId, setLotId] = useState("");
  const [drillSlots, setDrillSlots] = useState<Slot[]>([]);
  const [history, setHistory] = useState<RecentSession[]>([]);
  const [provName, setProvName] = useState("");
  const [provLoc, setProvLoc] = useState("");
  const [provCar, setProvCar] = useState(6);
  const [provBike, setProvBike] = useState(4);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [authTick, setAuthTick] = useState(0);
  const liveRef = useRef<{ stop: () => void } | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const o = await api<StatsOverview>("/api/stats/overview");
      setOverview(o);
    } catch (e: any) {
      setErr("Overview failed: " + e.message);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const h = await api<RecentSession[]>(
        `/api/sessions/recent?limit=15${lotId ? `&lot_id=${lotId}` : ""}`
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
  }, [authTick]);

  useEffect(() => {
    refresh();
    liveRef.current?.stop();
    liveRef.current = liveChannel("/ws/admin", () => refresh(), () => refresh(), 7000);
    return () => liveRef.current?.stop();
  }, [refresh]);

  async function provision() {
    setErr("");
    try {
      await api(
        `/api/lots/provision?name=${encodeURIComponent(provName)}&location=${encodeURIComponent(provLoc)}&car=${provCar}&bike=${provBike}`,
        "POST"
      );
      setNote("✅ Lot created.");
      setProvName("");
      setProvLoc("");
      const l = await api<Lot[]>("/api/lots");
      setLots(l);
      if (l.length) setLotId(l[l.length - 1].id);
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function resolveSession(sessionId: string) {
    try {
      await api("/api/admin/resolve", "POST", { session_id: sessionId });
      refresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-6 space-y-5 animate-fade-in">
      <AuthBar role="admin" onAuth={() => setAuthTick((t) => t + 1)} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      {note && <p className="text-sm text-emerald-600 font-medium">{note}</p>}

      {/* System Occupancy */}
      <Card className="p-6">
        <div className="flex items-baseline gap-3 mb-3">
          <h2 className="font-bold text-xl text-slate-800">
            System Occupancy
          </h2>
          {overview && (
            <span className="text-2xl font-extrabold text-blue-700">
              {overview.system_pct}%
            </span>
          )}
        </div>
        <ProgressBar value={overview?.system_pct ?? 0} size="md" />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
          {(overview?.lots ?? []).map((l: LotOverview) => (
            <div
              key={l.lot_id}
              className="bg-slate-50 border border-slate-200 rounded-xl p-4 transition-all duration-150 hover:shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-800">{l.name}</span>
                <span
                  className={`text-sm font-bold ${
                    l.pct > 80
                      ? "text-red-600"
                      : l.pct > 50
                        ? "text-amber-600"
                        : "text-emerald-600"
                  }`}
                >
                  {l.pct}%
                </span>
              </div>
              <ProgressBar value={l.pct} size="sm" />
              <p className="text-xs text-slate-500 mt-2">
                {l.occupied}/{l.total} occupied · {l.free} free
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Mismatch + Overstays */}
      <div className="grid md:grid-cols-2 gap-5">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-bold text-lg text-slate-800">Mismatch Queue</h2>
            {(overview?.mismatches.length ?? 0) > 0 && (
              <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {overview!.mismatches.length}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Denied sessions live here until resolved — never silently dropped.
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(!overview?.mismatches.length) ? (
              <p className="text-sm text-slate-400 text-center py-4">
                None — all clear.
              </p>
            ) : (
              overview!.mismatches.map((m) => (
                <div
                  key={m.session_id}
                  className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-sm"
                >
                  <span>
                    {m.slot_id} · {m.action}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => resolveSession(m.session_id)}
                  >
                    Resolve
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-bold text-lg text-slate-800 mb-1">Overstays</h2>
          <p className="text-xs text-slate-400 mb-3">
            Visibility only, no enforcement.
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(!overview?.overstays.length) ? (
              <p className="text-sm text-slate-400 text-center py-4">None.</p>
            ) : (
              overview!.overstays.map((o) => (
                <div
                  key={o.session_id}
                  className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm"
                >
                  <span>{o.vehicle_ref || "?"}</span>
                  <span className="text-slate-500">{o.slot_id}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Provision + History */}
      <div className="grid md:grid-cols-2 gap-5">
        <Card className="p-5">
          <h2 className="font-bold text-lg text-slate-800 mb-1">
            Provision Lot
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            No developer needed — create lots on the fly.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Input
              placeholder="Lot name"
              value={provName}
              onChange={(e) => setProvName(e.target.value)}
            />
            <Input
              placeholder="Location"
              value={provLoc}
              onChange={(e) => setProvLoc(e.target.value)}
            />
            <Input
              type="number"
              value={provCar}
              onChange={(e) => setProvCar(Number(e.target.value))}
              label="Car slots"
            />
            <Input
              type="number"
              value={provBike}
              onChange={(e) => setProvBike(Number(e.target.value))}
              label="Bike slots"
            />
          </div>
          <Button onClick={provision} className="w-full">
            Create Lot
          </Button>
        </Card>

        <Card className="p-5">
          <h2 className="font-bold text-lg text-slate-800 mb-3">
            Session History
          </h2>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">none</p>
            ) : (
              history.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-1.5 border-b border-slate-100 text-xs"
                >
                  <span className="font-mono">{r.vehicle_ref || "—"}</span>
                  <span className="text-slate-500">{r.flow}</span>
                  <Badge status={r.status} size="sm" />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Drill Down */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-bold text-lg text-slate-800">
            Drill Into Lot
          </h2>
          <select
            value={lotId}
            onChange={(e) => setLotId(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {drillSlots.map((s) => (
            <SlotTile key={s.id} slot={s} compact />
          ))}
        </div>
      </Card>
    </main>
  );
}
