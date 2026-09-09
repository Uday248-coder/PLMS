import type { Slot } from "../types";
import { VEHICLE_ICONS } from "../types";
import { Badge } from "./ui/Badge";
import { clsx } from "clsx";

interface Props {
  slot: Slot;
  children?: React.ReactNode;
  compact?: boolean;
}

function timeLeft(isoEnd: string | null): string | null {
  if (!isoEnd) return null;
  const end = new Date(isoEnd);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return "overdue";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m left` : `${hrs}h left`;
}

export function SlotTile({ slot, children, compact = false }: Props) {
  const remaining = slot.status !== "free" ? timeLeft(slot.estimated_end) : null;
  const isOverdue = remaining === "overdue";

  return (
    <div
      className={clsx(
        "bg-white border border-slate-200 rounded-xl transition-all duration-150",
        compact ? "p-2" : "p-3",
        slot.status !== "free" && "border-slate-200",
        slot.status === "free" && "border-emerald-100 bg-emerald-50/30",
        isOverdue && "border-red-300 bg-red-50/40"
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
      {slot.status !== "free" && slot.vehicle_ref && (
        <div className="mt-1.5 text-xs font-mono font-semibold text-slate-600 truncate" title={slot.vehicle_ref}>
          🚘 {slot.vehicle_ref}
        </div>
      )}
      {slot.status !== "free" && remaining && !compact && (
        <div className={clsx(
          "mt-1 text-xs font-medium",
          isOverdue ? "text-red-600" : "text-slate-400"
        )}>
          {isOverdue ? "⏰ Overdue" : `⏱ ${remaining}`}
        </div>
      )}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
