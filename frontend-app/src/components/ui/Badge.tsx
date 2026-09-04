import { clsx } from "clsx";
import type { SlotStatus } from "../../types";
import { STATUS_COLORS, STATUS_LABELS } from "../../types";

interface Props {
  status: SlotStatus;
  size?: "sm" | "md";
}

export function Badge({ status, size = "sm" }: Props) {
  const c = STATUS_COLORS[status] || {
    bg: "bg-slate-50",
    text: "text-slate-600",
    dot: "bg-slate-400",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        c.bg,
        c.text,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      )}
    >
      <span
        className={clsx(
          "rounded-full",
          c.dot,
          size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2"
        )}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
