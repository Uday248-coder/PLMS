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
        "glass rounded-2xl",
        hover &&
          "transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
Card.displayName = "Card";
