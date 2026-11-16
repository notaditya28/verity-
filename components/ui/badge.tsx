import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        outline: "text-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        low: "border-transparent bg-sky-100 text-sky-900",
        medium: "border-transparent bg-amber-100 text-amber-900",
        high: "border-transparent bg-orange-100 text-orange-900",
        critical: "border-transparent bg-red-100 text-red-900",
        success: "border-transparent bg-emerald-100 text-emerald-900",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
