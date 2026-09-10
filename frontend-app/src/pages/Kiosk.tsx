import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { api } from "../lib/api";
import { liveChannel } from "../lib/live";
import type { Lot, VehicleType, SlotStatus, CheckinResponse, WsMessage } from "../types";

type Step = "pick" | "ticket";

const STORAGE_KEY = "park_kiosk_ticket";

const DURATION_PRESETS = [
  { label: "1h", minutes: 60 },
  { label: "2h", minutes: 120 },
  { label: "3h", minutes: 180 },
  { label: "4h", minutes: 240 },
  { label: "5h", minutes: 300 },
  { label: "6h", minutes: 360 },
  { label: "7h", minutes: 420 },
  { label: "8h", minutes: 480 },
  { label: "10h", minutes: 600 },
  { label: "12h", minutes: 720 },
  { label: "24h", minutes: 1440 },
];

function haptic(duration = 25) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try {
      navigator.vibrate(duration);
    } catch {
      /* ignore */
    }
  }
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getTimeRemaining(isoEnd: string | null): { text: string; isOverdue: boolean; percent: number } {
  if (!isoEnd) return { text: "No limit", isOverdue: false, percent: 100 };
  const end = new Date(isoEnd);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) {
    const minsOver = Math.abs(Math.floor(diffMs / 60_000));
    return { text: `${minsOver}m overdue`, isOverdue: true, percent: 0 };
  }
  const mins = Math.floor(diffMs / 60_000);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  const label = hrs > 0 ? (rem > 0 ? `${hrs}h ${rem}m left` : `${hrs}h left`) : `${mins}m left`;
  return { text: label, isOverdue: false, percent: Math.max(5, Math.min(100, Math.round((mins / 420) * 100))) };
}

export default function Kiosk() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotId, setLotId] = useState("");
  const [vtype, setVtype] = useState<VehicleType>("car");
  const [plate, setPlate] = useState("");
  const [estMinutes, setEstMinutes] = useState(420);
  const [customMin, setCustomMin] = useState("");
  const [step, setStep] = useState<Step>("pick");
  const [ticket, setTicket] = useState<CheckinResponse | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SlotStatus>("reserved_pending");
  const [estimatedEnd, setEstimatedEnd] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [denied, setDenied] = useState(false);
  const [deniedMsg, setDeniedMsg] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [overdueMin, setOverdueMin] = useState(0);
  const [showExtend, setShowExtend] = useState(false);
  const [extendMin, setExtendMin] = useState(60);
  const [extendCustom, setExtendCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const liveRef = useRef<{ stop: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setTick] = useState(0);

  // Restore active ticket from localStorage on mount (persistence)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.sessionId && data.ticket) {
          sessionIdRef.current = data.sessionId;
          setLotId(data.lotId || "");
          setVtype(data.vtype || "car");
          setPlate(data.plate || "");
          setEstMinutes(data.estMinutes || 420);
          setTicket(data.ticket);
          setSessionStatus(data.sessionStatus || "reserved_pending");
          setEstimatedEnd(data.estimatedEnd || null);
          setStep("ticket");
        }
      }
    } catch {
      /* ignore corrupted storage */
    }
  }, []);

  // Fetch available lots
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
  }, [lotId]);

  // Tick every 15s to update countdown timer
  useEffect(() => {
    timerRef.current = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const onWs = useCallback(
    (msg: WsMessage) => {
      if (msg.session_id !== sessionIdRef.current) return;

      if (msg.event === "overdue") {
        setOverdue(true);
        setOverdueMin(msg.minutes_over ?? 0);
        haptic(150);
      } else if (msg.event === "session_extended" && msg.new_end) {
        setEstimatedEnd(msg.new_end);
        setOverdue(false);
        setShowExtend(false);
        haptic(40);
        updateStoredTicket({ estimatedEnd: msg.new_end });
      } else if (msg.terminal || msg.event === "guard_denied") {
        setDenied(true);
        setDeniedMsg(msg.message || "Denied by guard — please get a new slot.");
        setSessionStatus("mismatch");
        haptic(200);
        localStorage.removeItem(STORAGE_KEY);
      } else if (msg.status) {
        setSessionStatus(msg.status);
        updateStoredTicket({ sessionStatus: msg.status });
        if (msg.status === "free") {
          // Parking session finished and verified
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!lotId) return;
    liveRef.current?.stop();
    liveRef.current = liveChannel(`/ws/lot/${lotId}`, onWs, undefined, 6000);
    return () => liveRef.current?.stop();
  }, [lotId, onWs]);

  function updateStoredTicket(patch: Record<string, unknown>) {
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) {
        const parsed = JSON.parse(existing);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, ...patch }));
      }
    } catch {
      /* ignore */
    }
  }

  function getEffectiveMinutes(): number {
    const custom = parseInt(customMin, 10);
    return !isNaN(custom) && custom >= 1 ? custom : estMinutes;
  }

  async function handleCheckin() {
    setErr("");
    setDenied(false);
    setOverdue(false);
    const cleanPlate = plate.trim().toUpperCase();
    if (!cleanPlate) {
      setErr("Please enter your vehicle license plate number.");
      return;
    }
    const mins = getEffectiveMinutes();
    if (mins < 1 || mins > 1440) {
      setErr("Duration must be between 1 minute and 24 hours.");
      return;
    }

    setLoading(true);
    haptic(40);
    try {
      const r = await api<CheckinResponse>("/api/checkin", "POST", {
        lot_id: lotId,
        vehicle_type: vtype,
        vehicle_ref: cleanPlate,
        flow_type: "self_report",
        estimated_minutes: mins,
      });

      const end = new Date(Date.now() + mins * 60_000);
      const endIso = end.toISOString();

      sessionIdRef.current = r.session_id;
      setTicket(r);
      setSessionStatus(r.status);
      setEstMinutes(mins);
      setEstimatedEnd(endIso);
      setStep("ticket");

      // Save to localStorage for refresh safety
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sessionId: r.session_id,
          lotId,
          vtype,
          plate: cleanPlate,
          estMinutes: mins,
          ticket: r,
          sessionStatus: r.status,
          estimatedEnd: endIso,
        })
      );
    } catch (e: any) {
      setErr(e.message || "Failed to reserve slot");
      haptic(100);
    } finally {
      setLoading(false);
    }
  }

  async function handleParked() {
    if (!sessionIdRef.current) return;
    setLoading(true);
    haptic(40);
    try {
      const r = await api<{ status: SlotStatus }>("/api/driver/parked", "POST", {
        session_id: sessionIdRef.current,
      });
      setSessionStatus(r.status);
      updateStoredTicket({ sessionStatus: r.status });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLeaving() {
    if (!sessionIdRef.current) {
      setErr("No active request — tap 'Get My Slot' for a new one.");
      return;
    }
    setLoading(true);
    haptic(40);
    try {
      const r = await api<{ status: SlotStatus }>("/api/driver/leaving", "POST", {
        session_id: sessionIdRef.current,
      });
      setSessionStatus(r.status);
      updateStoredTicket({ sessionStatus: r.status });
    } catch (e: any) {
      setErr(e.message);
      if (
        e.message?.includes("denied") ||
        e.message?.includes("410") ||
        e.message?.includes("stale")
      ) {
        setDenied(true);
        setDeniedMsg("This session has concluded.");
        localStorage.removeItem(STORAGE_KEY);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleExtend() {
    if (!sessionIdRef.current) return;
    setErr("");
    const custom = parseInt(extendCustom, 10);
    const mins = !isNaN(custom) && custom >= 1 ? custom : extendMin;
    if (mins < 1 || mins > 1440) {
      setErr("Extension must be between 1 minute and 24 hours.");
      return;
    }
    setLoading(true);
    haptic(40);
    try {
      const r = await api<{ estimated_end: string }>("/api/driver/extend", "POST", {
        session_id: sessionIdRef.current,
        additional_minutes: mins,
      });
      setEstimatedEnd(r.estimated_end);
      setOverdue(false);
      setShowExtend(false);
      setExtendCustom("");
      updateStoredTicket({ estimatedEnd: r.estimated_end });
    } catch (e: any) {
      setErr(e.message);
      haptic(100);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    haptic(30);
    setStep("pick");
    setTicket(null);
    setDenied(false);
    setDeniedMsg("");
    setErr("");
    setPlate("");
    setEstMinutes(420);
    setCustomMin("");
    setOverdue(false);
    setShowExtend(false);
    setEstimatedEnd(null);
    sessionIdRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  const timerInfo = getTimeRemaining(estimatedEnd);
  const isOverdue = timerInfo.isOverdue || overdue;

  return (
    <main className="max-w-xl mx-auto px-4 py-6 sm:py-10 space-y-5 animate-fade-in">
      {/* Header Banner */}
      <div className="text-center mb-2">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mb-1 flex items-center justify-center gap-2">
          <span>🅿️</span>
          <span>Instant Parking</span>
        </h1>
        <p className="text-slate-500 text-sm font-medium">
          Walk-in access · Instant spot allocation · Zero app install
        </p>
      </div>

      {step === "pick" && (
        <Card className="p-6 sm:p-7 space-y-6 shadow-md border-slate-200">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Step 1: Vehicle & Duration
              </h2>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Gate Fast-Track
              </span>
            </div>

            {/* Inputs: Lot, Vehicle Type, Plate */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
              <Select label="Parking Lot" value={lotId} onChange={(e) => setLotId(e.target.value)}>
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} {l.location ? `· ${l.location}` : ""}
                  </option>
                ))}
              </Select>

              <Select
                label="Vehicle Type"
                value={vtype}
                onChange={(e) => setVtype(e.target.value as VehicleType)}
              >
                <option value="car">🚗 Car</option>
                <option value="bike">🏍️ Motorbike</option>
                <option value="truck">🚛 Van / Truck</option>
              </Select>

              <div>
                <Input
                  label="Plate Number"
                  placeholder="e.g. MH12-AB-9999"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  className="font-mono uppercase font-bold tracking-wider"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Parking Duration: Wyatt Feaster Tactile Chips + Custom Input */}
            <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Estimated Parking Duration
                </label>
                <span className="text-xs font-semibold text-blue-600 font-mono">
                  {formatDuration(getEffectiveMinutes())}
                </span>
              </div>

              {/* Preset Chips */}
              <div className="flex flex-wrap gap-2 mb-3.5">
                {DURATION_PRESETS.map((d) => {
                  const isSelected = estMinutes === d.minutes && !customMin;
                  return (
                    <button
                      key={d.minutes}
                      type="button"
                      onClick={() => {
                        haptic(15);
                        setEstMinutes(d.minutes);
                        setCustomMin("");
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all duration-150 transform-gpu active:scale-95 cursor-pointer ${
                        isSelected
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom Duration Input */}
              <div className="flex items-center gap-3">
                <div className="w-40">
                  <Input
                    placeholder="Custom mins"
                    type="number"
                    min="1"
                    max="1440"
                    value={customMin}
                    onChange={(e) => setCustomMin(e.target.value)}
                  />
                </div>
                <span className="text-xs text-slate-500">
                  {customMin
                    ? `= ${formatDuration(parseInt(customMin, 10) || 0)}`
                    : "or type custom minutes (up to 24h)"}
                </span>
              </div>
            </div>

            {err && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
                <span>⚠️</span>
                <span>{err}</span>
              </div>
            )}

            <Button
              onClick={handleCheckin}
              disabled={loading}
              className="w-full text-lg shadow-md"
              size="lg"
              variant="success"
            >
              {loading ? "Allocating Slot..." : "⚡ Get My Assigned Slot"}
            </Button>
          </div>
        </Card>
      )}

      {step === "ticket" && ticket && (
        <Card className="p-6 sm:p-8 text-center space-y-6 shadow-lg border-slate-200">
          {denied ? (
            <div className="space-y-4 py-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl mx-auto">
                ❌
              </div>
              <h2 className="text-xl font-bold text-red-700">{deniedMsg}</h2>
              <Button onClick={reset} size="lg" variant="primary">
                Get a New Slot
              </Button>
            </div>
          ) : isOverdue && !showExtend ? (
            /* Overdue Alert Takeover */
            <div className="space-y-4 py-2 animate-fade-in">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-4xl mx-auto animate-pulse">
                ⏰
              </div>
              <h2 className="text-2xl font-black text-red-700">Parking Time Ended</h2>
              <p className="text-sm text-red-600 font-medium max-w-sm mx-auto">
                {overdueMin > 0
                  ? `Your vehicle (${plate}) is ${overdueMin} minutes overdue.`
                  : `Your booked parking window for ${plate} has ended.`}
              </p>
              <p className="text-xs text-slate-500">
                Guards have been notified. Please extend your duration now or depart the parking bay.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button
                  onClick={() => {
                    haptic(20);
                    setShowExtend(true);
                  }}
                  size="lg"
                  variant="primary"
                  className="w-full sm:w-auto"
                >
                  ⏳ Extend Parking Time
                </Button>
                <Button
                  onClick={handleLeaving}
                  disabled={loading}
                  size="lg"
                  variant="danger"
                  className="w-full sm:w-auto"
                >
                  🚗 I'm Leaving Now
                </Button>
              </div>
            </div>
          ) : showExtend ? (
            /* Post-parking extension sheet */
            <div className="space-y-5 text-left animate-fade-in">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Extend Parking Time</h2>
                  <p className="text-xs text-slate-500">
                    Slot {ticket.zone}-{ticket.number} · 🚘 {plate}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExtend(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Select Additional Time
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {[30, 60, 120, 180, 240, 360].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        haptic(15);
                        setExtendMin(m);
                        setExtendCustom("");
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 cursor-pointer ${
                        extendMin === m && !extendCustom
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                          : "bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                      }`}
                    >
                      +{formatDuration(m)}
                    </button>
                  ))}
                </div>
                <div className="w-48">
                  <Input
                    label="Or custom minutes"
                    type="number"
                    min="1"
                    placeholder="e.g. 45"
                    value={extendCustom}
                    onChange={(e) => setExtendCustom(e.target.value)}
                  />
                </div>
              </div>

              {err && <p className="text-xs text-red-600">{err}</p>}

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleExtend}
                  disabled={loading}
                  size="md"
                  variant="success"
                  className="flex-1"
                >
                  {loading ? "Extending..." : "Confirm Extension"}
                </Button>
                <Button
                  onClick={() => {
                    setShowExtend(false);
                    setErr("");
                  }}
                  size="md"
                  variant="secondary"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            /* Standard Live Ticket Screen */
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold mb-3 border border-blue-200/60">
                  <span>📍 Head to Assigned Slot</span>
                </div>

                <div className="text-6xl sm:text-7xl font-black tracking-tight text-blue-700 my-1 font-mono">
                  {ticket.zone}-{ticket.number}
                </div>

                <div className="flex items-center justify-center gap-2 my-2.5">
                  <Badge status={sessionStatus} size="md" />
                  <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200">
                    🚘 {plate}
                  </span>
                </div>

                {/* Countdown timer pill */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 max-w-xs mx-auto mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-500 font-medium">Time Left</span>
                    <span
                      className={`font-mono font-bold ${
                        isOverdue ? "text-red-600" : "text-blue-600"
                      }`}
                    >
                      {timerInfo.text}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isOverdue ? "bg-red-500" : "bg-blue-600"
                      }`}
                      style={{ width: `${timerInfo.percent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons with Wyatt Feaster tactile springs */}
              <div className="space-y-3 pt-2">
                <div className="flex gap-3">
                  <Button
                    onClick={handleParked}
                    disabled={loading || sessionStatus === "occupied"}
                    className="flex-1"
                    size="lg"
                    variant={sessionStatus === "occupied" ? "secondary" : "primary"}
                  >
                    {sessionStatus === "occupied" ? "✓ Parked (Confirmed)" : "✅ I've Parked"}
                  </Button>

                  <Button
                    onClick={() => {
                      haptic(20);
                      setShowExtend(true);
                    }}
                    size="lg"
                    variant="secondary"
                    className="px-5"
                    title="Extend your parking duration"
                  >
                    ⏳ Extend
                  </Button>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <Button
                    onClick={handleLeaving}
                    disabled={loading}
                    className="w-full"
                    size="lg"
                    variant="danger"
                  >
                    🚗 I'm Leaving Now
                  </Button>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Tapping releases your slot immediately. Your ticket is auto-saved in this browser.
                  </p>
                </div>
              </div>

              {/* Reset / New Driver Walk-up */}
              <div className="pt-2 border-t border-slate-100 flex justify-center">
                <button
                  type="button"
                  onClick={reset}
                  className="text-xs text-slate-400 hover:text-slate-600 font-medium cursor-pointer"
                >
                  Start New Vehicle Check-in →
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
    </main>
  );
}
