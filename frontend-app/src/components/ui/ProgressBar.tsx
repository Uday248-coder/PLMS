import { clsx } from "clsx";

interface Props {
  value: number;
  color?: "blue" | "emerald" | "amber" | "red";
  size?: "sm" | "md";
  className?: string;
}

const barColors = {
  blue: "bg-blue-600",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export function ProgressBar({ value, color = "blue", size = "md", className }: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const autoColor = clamped > 80 ? "red" : clamped > 50 ? "amber" : color;
  return (
    <div
      className={clsx(
        "bg-slate-100 rounded-full overflow-hidden",
        size === "sm" ? "h-1.5" : "h-2.5",
        className
      )}
    >
      <div
        className={clsx(
          "h-full rounded-full transition-all duration-500 ease-out",
          barColors[autoColor]
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
