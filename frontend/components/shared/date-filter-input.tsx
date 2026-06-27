"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { displayDateToIsoDate, isoDateToDisplayDate } from "@/lib/date-format";

type DateFilterInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  prefixLabel?: string;
};

export function DateFilterInput({
  label,
  value,
  onChange,
  className,
  inputClassName,
  placeholder = "dd/mm/yyyy",
  prefixLabel,
}: DateFilterInputProps) {
  const nativeDateInputRef = useRef<HTMLInputElement | null>(null);
  const [displayValue, setDisplayValue] = useState(isoDateToDisplayDate(value));
  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    setDisplayValue(isoDateToDisplayDate(value));
    setIsInvalid(false);
  }, [value]);

  function handleTextChange(nextValue: string) {
    setDisplayValue(nextValue);

    if (!nextValue.trim()) {
      setIsInvalid(false);
      onChange("");
      return;
    }

    const isoValue = displayDateToIsoDate(nextValue);

    if (isoValue) {
      setIsInvalid(false);
      onChange(isoValue);
      return;
    }

    setIsInvalid(true);
  }

  function handleNativeDateChange(nextIsoValue: string) {
    setIsInvalid(false);
    onChange(nextIsoValue);
    setDisplayValue(isoDateToDisplayDate(nextIsoValue));
  }

  function openNativeDatePicker() {
    const inputElement = nativeDateInputRef.current;
    if (!inputElement) return;

    inputElement.focus();

    if (typeof inputElement.showPicker === "function") {
      inputElement.showPicker();
    }
  }

  return (
    <div className={cn("relative w-full space-y-2", className)}>
      {label ? <Label>{label}</Label> : null}

      <div className="relative w-full">
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border border-input bg-background px-3 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
            inputClassName || "h-10",
            isInvalid && "border-red-500 focus-within:ring-red-500"
          )}
        >
          {prefixLabel && (
            <span className="shrink-0 text-xs font-medium text-slate-500">{prefixLabel}:</span>
          )}
          <input
            type="text"
            inputMode="numeric"
            placeholder={placeholder}
            value={displayValue}
            onChange={(event) => handleTextChange(event.target.value)}
            onClick={openNativeDatePicker}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            aria-label="Mở lịch chọn ngày"
            onClick={openNativeDatePicker}
            className="flex h-full items-center justify-center text-muted-foreground hover:text-foreground focus:outline-none"
          >
            <CalendarDays className="h-4 w-4 shrink-0" />
          </button>
        </div>

        <input
          ref={nativeDateInputRef}
          type="date"
          value={value || ""}
          onChange={(event) => handleNativeDateChange(event.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 h-full w-11 opacity-0"
        />
      </div>

      {isInvalid ? (
        <p className="absolute left-0 -bottom-5 z-10 whitespace-nowrap text-xs text-red-500">
          Vui lòng nhập ngày theo định dạng dd/mm/yyyy.
        </p>
      ) : null}
    </div>
  );
}
