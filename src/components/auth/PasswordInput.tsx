"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

export type PasswordInputProps = {
  id: string;
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
  describedBy?: string;
  /**
   * The field's visible label. It goes into the toggle's accessible name, so a
   * form with three password fields does not read out as three buttons all
   * called "Show password".
   */
  label?: string;
};

/**
 * A password field with a reveal toggle. Every password field in the app uses
 * this one, so the control sits in the same place and behaves the same way on
 * the sign-in card, the reset form and the change form.
 *
 * The toggle is a `type="button"` — inside a form, a bare button submits, and
 * pressing "show" must never post the form. It starts hidden on every render:
 * the state is local and deliberately not persisted, so a password is never
 * revealed by a page the user did not just ask to reveal it on.
 *
 * Not on the design canvas. Added on request in Phase 02; worth drawing there
 * so the two stay in step.
 */
export function PasswordInput({
  id,
  value,
  autoComplete,
  onChange,
  describedBy,
  label = "password",
}: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  const Icon = revealed ? EyeOff : Eye;
  const action = `${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`;

  return (
    <div className="relative">
      <Input
        id={id}
        name={id}
        type={revealed ? "text" : "password"}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={describedBy}
        // Room for the toggle, so a long password never runs under it.
        className="pr-control-md"
      />
      <button
        type="button"
        onClick={() => setRevealed((current) => !current)}
        aria-label={action}
        aria-pressed={revealed}
        aria-controls={id}
        className="absolute inset-y-0 right-0 flex w-control-md items-center justify-center rounded-r-sm text-ink-tertiary transition-colors duration-[0.25s] ease-[cubic-bezier(0.5,0,0.5,1)] hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
