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
};

export function DateFilterInput({
  label,
  value,
  onChange,
  className,
  inputClassName,
  placeholder = "dd/mm/yyyy",
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
      <Label>{label}</Label>

      <div className="relative">
        <Input
          type="text"
          inputMode="numeric"
          placeholder={placeholder}
          value={displayValue}
          onChange={(event) => handleTextChange(event.target.value)}
          onClick={openNativeDatePicker}
          className={cn(
            "h-11 pr-11",
            isInvalid && "border-red-500 focus-visible:ring-red-500",
            inputClassName
          )}
        />

        <button
          type="button"
          aria-label="Mở lịch chọn ngày"
          onClick={openNativeDatePicker}
          className="absolute right-0 top-0 flex h-full w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <CalendarDays className="h-4 w-4" />
        </button>

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
