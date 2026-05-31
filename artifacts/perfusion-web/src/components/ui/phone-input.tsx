import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

const PREFIX = "+91";

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, onChange, placeholder, ...props }, ref) => {
    const strValue = String(value ?? "");
    const displayValue = strValue.startsWith(PREFIX) ? strValue.slice(PREFIX.length) : strValue;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (onChange) {
        const synthetic = {
          ...e,
          target: { ...e.target, value: PREFIX + e.target.value },
          currentTarget: { ...e.currentTarget, value: PREFIX + e.currentTarget.value },
        };
        (onChange as React.ChangeEventHandler<HTMLInputElement>)(synthetic as unknown as React.ChangeEvent<HTMLInputElement>);
      }
    };

    return (
      <div className="flex rounded-md shadow-sm">
        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground select-none shrink-0">
          +91
        </span>
        <input
          ref={ref}
          type="tel"
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder !== undefined ? placeholder : "XXXXX XXXXX"}
          className={cn(
            "flex h-9 w-full rounded-l-none rounded-r-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
PhoneInput.displayName = "PhoneInput";
