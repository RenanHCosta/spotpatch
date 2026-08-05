import { Slot } from "@radix-ui/react-slot";
import clsx, { type ClassValue } from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Button({
  className,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-[4px] bg-accent px-3 text-[12.5px] font-semibold text-surface transition-colors duration-100 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border border-line bg-surface", className)} {...props} />;
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex rounded-[4px] border border-line bg-canvas px-2 py-0.5 font-mono text-[11px] text-mute",
        className,
      )}
      {...props}
    />
  );
}
