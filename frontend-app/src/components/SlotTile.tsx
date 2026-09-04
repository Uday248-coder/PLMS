import type { Slot } from "../types";
import { VEHICLE_ICONS } from "../types";
import { Badge } from "./ui/Badge";
import { clsx } from "clsx";

interface Props {
  slot: Slot;
  children?: React.ReactNode;
  compact?: boolean;
}

export function SlotTile({ slot, children, compact = false }: Props) {
  return (
    <div
      className={clsx(
        "bg-white border border-slate-200 rounded-xl transition-all duration-150",
        compact ? "p-2" : "p-3",
        slot.status !== "free" && "border-slate-200",
        slot.status === "free" && "border-emerald-100 bg-emerald-50/30"
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono font-bold text-sm text-slate-800">
          {slot.zone}-{slot.number}
        </span>
        <span className="text-base">
          {VEHICLE_ICONS[slot.vehicle_type]}
        </span>
      </div>
      <Badge status={slot.status} size={compact ? "sm" : "sm"} />
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
