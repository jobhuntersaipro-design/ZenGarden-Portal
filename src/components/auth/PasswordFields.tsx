"use client";

import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/auth/FieldLabel";

/** The rule, stated where the user is typing rather than only on failure. */
export const PASSWORD_HINT =
  "At least 10 characters, with a letter and a digit.";

export function PasswordField({
  id,
  label,
  value,
  autoComplete,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  hint?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-xxs">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={id}
        type="password"
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint ? (
        <p
          id={`${id}-hint`}
          className="text-[length:var(--text-caption)] text-ink-tertiary"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
