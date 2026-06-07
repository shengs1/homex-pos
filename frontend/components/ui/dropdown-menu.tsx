"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type DropdownContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  rootRef: React.RefObject<HTMLDivElement | null>;
};

const DropdownContext = React.createContext<DropdownContextValue | null>(null);

function useDropdownContext() {
  const context = React.useContext(DropdownContext);
  if (!context) {
    throw new Error("DropdownMenu components must be used inside DropdownMenu");
  }
  return context;
}

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const isInsideTrigger = rootRef.current?.contains(target);
      const isInsideContent = contentRef.current?.contains(target);

      if (!isInsideTrigger && !isInsideContent) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <DropdownContext.Provider value={{ open, setOpen, triggerRef, contentRef, rootRef }}>
      <div ref={rootRef} className="relative inline-flex text-left">
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

type DropdownMenuTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  children: React.ReactNode;
};

export function DropdownMenuTrigger({ asChild, children, onClick, ...props }: DropdownMenuTriggerProps) {
  const { setOpen, triggerRef } = useDropdownContext();

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<Record<string, unknown>>;
    const childProps = child.props as { onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void; ref?: React.Ref<HTMLElement> };

    return React.cloneElement(child, {
      ref: (node: HTMLElement | null) => {
        triggerRef.current = node;
        const childRef = childProps.ref;
        if (typeof childRef === "function") childRef(node);
        else if (childRef && typeof childRef === "object") {
          (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
        }
      },
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        childProps.onClick?.(event);
        onClick?.(event);
        setOpen((value) => !value);
      },
    } as Record<string, unknown>);
  }

  return (
    <button
      ref={(node) => {
        triggerRef.current = node;
      }}
      type="button"
      onClick={(event) => {
        onClick?.(event);
        setOpen((value) => !value);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownMenuPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

type DropdownMenuContentProps = {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "end";
  side?: "top" | "bottom";
  sideOffset?: number;
  collisionPadding?: number;
};

function getFloatingPosition(
  triggerRect: DOMRect,
  align: "start" | "end",
  preferredSide: "top" | "bottom",
  sideOffset: number,
  collisionPadding: number
) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const estimatedWidth = 220;
  const estimatedHeight = 190;

  const spaceBelow = viewportHeight - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  const shouldOpenTop = preferredSide === "top" || (spaceBelow < estimatedHeight && spaceAbove > spaceBelow);

  const top = shouldOpenTop
    ? Math.max(collisionPadding, triggerRect.top - estimatedHeight - sideOffset)
    : Math.min(viewportHeight - estimatedHeight - collisionPadding, triggerRect.bottom + sideOffset);

  const left = align === "end"
    ? Math.min(viewportWidth - estimatedWidth - collisionPadding, Math.max(collisionPadding, triggerRect.right - estimatedWidth))
    : Math.min(viewportWidth - estimatedWidth - collisionPadding, Math.max(collisionPadding, triggerRect.left));

  return { top, left, width: estimatedWidth };
}

export function DropdownMenuContent({
  children,
  className,
  align = "end",
  side = "bottom",
  sideOffset = 8,
  collisionPadding = 16,
}: DropdownMenuContentProps) {
  const { open, triggerRef, contentRef } = useDropdownContext();
  const [mounted, setMounted] = React.useState(false);
  const [style, setStyle] = React.useState<React.CSSProperties>({});

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current || typeof window === "undefined") return;

    function updatePosition() {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const position = getFloatingPosition(rect, align, side, sideOffset, collisionPadding);
      setStyle({ position: "fixed", top: position.top, left: position.left, minWidth: position.width });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [align, collisionPadding, open, side, sideOffset, triggerRef]);

  if (!open || !mounted) return null;

  const content = (
    <div
      ref={contentRef}
      className={cn(
        "z-[9999] max-h-[min(340px,calc(100vh-2rem))] overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-2xl",
        className
      )}
      style={style}
    >
      {children}
    </div>
  );

  return createPortal(content, document.body);
}

type DropdownMenuItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  inset?: boolean;
};

export function DropdownMenuItem({ className, inset, onClick, children, ...props }: DropdownMenuItemProps) {
  const { setOpen } = useDropdownContext();

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
        inset && "pl-8",
        className
      )}
      onClick={(event) => {
        onClick?.(event);
        setOpen(false);
      }}
      {...props}
    >
      {children}
    </button>
  );
}
