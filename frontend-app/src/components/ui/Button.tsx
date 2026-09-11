import { type ButtonHTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

type Variant = "primary" | "secondary" | "danger" | "success" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-md shadow-primary-600/20",
  secondary:
    "bg-white text-surface-700 border border-surface-200 hover:bg-surface-50 active:bg-surface-100 hover:border-surface-300",
  danger: "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm shadow-rose-600/20",
  success:
    "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm shadow-emerald-600/20",
  ghost: "text-surface-600 hover:bg-surface-100 active:bg-surface-200",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", size = "md", className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 transform-gpu active:scale-[0.97] cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100",
          variants[variant],
          size === "sm" && "px-3 py-1.5 text-xs min-h-[36px]",
          size === "md" && "px-4 py-2 text-sm min-h-[42px]",
          size === "lg" && "px-6 py-3.5 text-base min-h-[50px]",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
