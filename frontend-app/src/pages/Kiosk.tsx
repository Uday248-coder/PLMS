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

const DURATION_OPTIONS = [
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "3 hours", value: 180 },
  { label: "4 hours", value: 240 },
  { label: "5 hours", value: 300 },
  { label: "6 hours", value: 360 },
  { label: "7 hours (default)", value: 420 },
  { label: "8 hours", value: 480 },
  { label: "10 hours", value: 600 },
  { label: "12 hours", value: 720 },
  { label: "24 hours", value: 1440 },
];

export default function Kiosk() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotId, setLotId] = useState("");
  const [vtype, setVtype] = useState<VehicleType>("car");
  const [plate, setPlate] = useState("");
  const [estMinutes, setEstMinutes] = useState(420);
  const [step, setStep] = useState<Step>("pick");
  const [ticket, setTicket] = useState<CheckinResponse | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SlotStatus>("reserved_pending");
  const [err, setErr] = useState("");
  const [denied, setDenied] = useState(false);
  const [deniedMsg, setDeniedMsg] = useState("");
  const sessionIdRef = useRef<string | null>(null);
  const liveRef = useRef<{ stop: () => void } | null>(null);

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
        if (l.length) setLotId(l[0].id);
      })
      .catch(() => {});
  }, []);

  const onWs = useCallback(
    (msg: WsMessage) => {
      if (msg.session_id !== sessionIdRef.current) return;
      if (msg.terminal || msg.event === "guard_denied") {
        setDenied(true);
        setDeniedMsg(
          msg.message || "Denied — tap 'Get My Slot' for a new slot."
        );
        setSessionStatus("mismatch");
      } else if (msg.status) {
        setSessionStatus(msg.status);
      }
    },
    []
  );

  useEffect(() => {
    if (!lotId) return;
    liveRef.current?.stop();
    liveRef.current = liveChannel(
      `/ws/lot/${lotId}`,
      onWs,
      undefined,
      8000
    );
    return () => liveRef.current?.stop();
  }, [lotId, onWs]);

  async function handleCheckin() {
    setErr("");
    setDenied(false);
    if (!plate.trim()) {
      setErr("Please enter your vehicle plate number.");
      return;
    }
    try {
      const r = await api<CheckinResponse>("/api/checkin", "POST", {
        lot_id: lotId,
        vehicle_type: vtype,
        vehicle_ref: plate.trim(),
        flow_type: "self_report",
        estimated_minutes: estMinutes,
      });
      sessionIdRef.current = r.session_id;
      setTicket(r);
      setSessionStatus(r.status);
      setStep("ticket");
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function handleParked() {
    if (!sessionIdRef.current) return;
    try {
      const r = await api<{ status: SlotStatus }>(
        "/api/driver/parked",
        "POST",
        { session_id: sessionIdRef.current }
      );
      setSessionStatus(r.status);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function handleLeaving() {
    if (!sessionIdRef.current) {
      setErr("No active request — tap 'Get My Slot' for a new one.");
      return;
    }
    try {
      const r = await api<{ status: SlotStatus }>(
        "/api/driver/leaving",
        "POST",
        { session_id: sessionIdRef.current }
      );
      setSessionStatus(r.status);
    } catch (e: any) {
      setErr(e.message);
      if (
        e.message?.includes("denied") ||
        e.message?.includes("410") ||
        e.message?.includes("stale")
      ) {
        setDenied(true);
        setDeniedMsg("Request closed — tap 'Get My Slot' for a new one.");
      }
    }
  }

  function reset() {
    setStep("pick");
    setTicket(null);
    setDenied(false);
    setDeniedMsg("");
    setErr("");
    setPlate("");
    setEstMinutes(420);
    sessionIdRef.current = null;
  }

  function formatDuration(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m} min`;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-10 space-y-5 animate-fade-in">
      <div className="text-center mb-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 mb-2">
          Get a Parking Slot
        </h1>
        <p className="text-slate-500 text-sm">
          Walk-in · no login · works on gate screens or your phone
        </p>
      </div>

      {step === "pick" && (
        <Card className="p-6 space-y-5">
          <div>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Step 1 — Your Vehicle
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <Select
                label="Lot"
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
              >
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.location ? ` · ${l.location}` : ""}
                  </option>
                ))}
              </Select>
              <Select
                label="Vehicle"
                value={vtype}
                onChange={(e) => setVtype(e.target.value as VehicleType)}
              >
                <option value="car">🚗 Car</option>
                <option value="bike">🏍️ Bike</option>
                <option value="truck">🚛 Truck</option>
              </Select>
              <Input
                label="Plate Number"
                placeholder="MH12-AB-1234"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <Select
                label="Estimated Parking Duration"
                value={estMinutes}
                onChange={(e) => setEstMinutes(Number(e.target.value))}
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </div>
            {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
            <Button
              onClick={handleCheckin}
              className="w-full"
              size="lg"
              variant="success"
            >
              Get My Slot
            </Button>
          </div>
        </Card>
      )}

      {step === "ticket" && ticket && (
        <Card className="p-8 text-center space-y-5">
          {denied ? (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl mx-auto">
                ❌
              </div>
              <h2 className="text-xl font-bold text-red-700">{deniedMsg}</h2>
              <Button onClick={reset} size="lg" variant="primary">
                Get a New Slot
              </Button>
            </>
          ) : (
            <>
              <div>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Step 2 — Park Here
                </h2>
                <p className="text-sm text-slate-500 mb-1">Your slot</p>
                <div className="text-7xl font-black tracking-tight text-blue-700 my-2">
                  {ticket.zone}-{ticket.number}
                </div>
                <Badge status={sessionStatus} size="md" />
                <div className="mt-3 space-y-1">
                  <p className="text-sm text-slate-600 font-medium">
                    🚘 {plate}
                  </p>
                  <p className="text-xs text-slate-400">
                    Booked for {formatDuration(estMinutes)}
                  </p>
                </div>
              </div>

              <Button
                onClick={handleParked}
                className="w-full"
                size="lg"
                variant="primary"
              >
                I've Parked
              </Button>

              <div className="border-t border-slate-100 pt-5 space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Step 3 — Leaving?
                </h3>
                <Button
                  onClick={handleLeaving}
                  className="w-full"
                  size="lg"
                  variant="secondary"
                >
                  I'm Leaving
                </Button>
                <p className="text-xs text-slate-400">
                  A guard confirms with one tap. Auto-confirms after a few
                  minutes if the guard is busy.
                </p>
              </div>
            </>
          )}
        </Card>
      )}
    </main>
  );
}
