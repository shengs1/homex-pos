import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-w-fit items-center justify-center gap-2 whitespace-nowrap rounded-xl text-center text-sm font-semibold leading-none transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-primary/20",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "min-h-10 px-4 py-2.5",
        sm: "min-h-9 px-3 py-2 text-xs",
        lg: "min-h-11 px-8 py-3 text-base",
        icon: "h-10 w-10 min-w-10 p-0 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type, ...props }, ref) => {
  return <button ref={ref} type={type || "button"} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});

Button.displayName = "Button";

export { Button, buttonVariants };
