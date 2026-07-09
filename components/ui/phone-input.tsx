"use client";

import { forwardRef } from "react";
import ReactPhoneInput, {
  type Country,
  type Value,
} from "react-phone-number-input";
import { cn } from "@/lib/utils";

// ─── Custom text-input ────────────────────────────────────────────────────────

const CustomInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function CustomInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none",
        className,
      )}
      {...props}
    />
  );
});

// ─── PhoneInput ───────────────────────────────────────────────────────────────

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  defaultCountry?: Country;
  className?: string;
}

export function PhoneInput({
  value,
  onChange,
  placeholder = "+1 555 000 0000",
  disabled,
  defaultCountry = "SA",
  className,
}: PhoneInputProps) {
  return (
    <div
      className={cn(
        "border-input bg-background focus-within:ring-ring focus-within:border-ring flex items-center gap-1.5 rounded-lg border px-3 py-2 transition-shadow focus-within:ring-2",
        disabled && "opacity-50",
        className,
      )}
    >
      <ReactPhoneInput
        international
        countryCallingCodeEditable={false}
        defaultCountry={defaultCountry}
        value={value as Value}
        onChange={(v) => onChange(v ?? "")}
        disabled={disabled}
        placeholder={placeholder}
        inputComponent={CustomInput}
        className="flex w-full items-center gap-1.5"
      />
    </div>
  );
}
