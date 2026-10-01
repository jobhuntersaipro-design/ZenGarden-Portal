"use client";

import { FieldLabel } from "@/components/auth/FieldLabel";
import { PasswordInput } from "@/components/auth/PasswordInput";
import {
  PasswordStrength,
  type PasswordRule,
} from "@/components/arc/password-strength/password-strength";

/**
 * `passwordSchema`'s own rules (src/lib/validation/auth.ts), so the meter can
 * never call a password strong that the server will refuse — and never asks
 * for a symbol or a capital the server does not.
 */
export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: "At least 10 characters",
    test: (password) => Array.from(password).length >= 10,
    remaining: (password) => Math.max(0, 10 - Array.from(password).length),
  },
  { id: "letter", label: "A letter", test: (password) => /\p{L}/u.test(password) },
  { id: "digit", label: "A digit", test: (password) => /\d/.test(password) },
];

export function PasswordField({
  id,
  label,
  value,
  autoComplete,
  hint,
  strength = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  autoComplete: string;
  hint?: string;
  /** The new password: Arc's strength meter and the rules, met as typed. */
  strength?: boolean;
  onChange: (value: string) => void;
}) {
  if (strength) {
    return (
      // One label element, Arc's, wearing our label style; the toggle takes
      // the 44px floor on a phone.
      <div className="[&_button]:size-11 sm:[&_button]:size-8 [&_label]:font-mono [&_label]:text-[length:var(--text-eyebrow)] [&_label]:font-normal [&_label]:text-ink-tertiary">
        <PasswordStrength
          id={id}
          name={id}
          required
          label={label}
          autoComplete={autoComplete}
          value={value}
          rules={PASSWORD_RULES}
          onValueChange={(next) => onChange(next)}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-xxs">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <PasswordInput
        id={id}
        label={label}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        describedBy={hint ? `${id}-hint` : undefined}
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
