import { clsx } from "clsx";

interface Props {
  connected: boolean;
  className?: string;
}

export function LiveDot({ connected, className }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 text-sm font-semibold tracking-wide px-3 py-1.5 rounded-full",
        connected ? "text-emerald-700 bg-emerald-50 border border-emerald-100" : "text-surface-500 bg-surface-100 border border-surface-200",
        className
      )}
    >
      <span
        className={clsx(
          "w-2.5 h-2.5 rounded-full shadow-sm",
          connected ? "bg-emerald-500 animate-pulse-dot shadow-emerald-500/40" : "bg-surface-300"
        )}
      />
      {connected ? "System Live" : "Offline"}
    </span>
  );
}
