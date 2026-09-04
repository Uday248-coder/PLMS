import { type HTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

interface Props extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export const Card = forwardRef<HTMLDivElement, Props>(
  ({ hover = false, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx(
        "bg-white border border-slate-200 rounded-xl shadow-sm",
        hover &&
          "transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
Card.displayName = "Card";
