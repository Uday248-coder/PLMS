import { clsx } from "clsx";

interface Props {
  connected: boolean;
  className?: string;
}

export function LiveDot({ connected, className }: Props) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        connected ? "text-emerald-500" : "text-slate-400",
        className
      )}
    >
      <span
        className={clsx(
          "w-2 h-2 rounded-full",
          connected ? "bg-emerald-500 animate-pulse-dot" : "bg-slate-300"
        )}
      />
      {connected ? "Live" : "Offline"}
    </span>
  );
}
