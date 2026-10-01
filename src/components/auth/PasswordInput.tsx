"use client";

import { useState } from "react";
import arc from "@/components/arc/password-field/password-field.module.css";
import { EyeMorph } from "@/components/arc/password-field/password-field";

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
  /** Sign-in and reset require it; the admin's optional "set a password" does not. */
  required?: boolean;
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
 * Drawn as Arc's password field — its shell, its focus ring and the eye a
 * slash draws across — around our own label, so each toggle keeps a name of
 * its own ("Show current password") rather than Arc's shared one.
 */
export function PasswordInput({
  id,
  value,
  autoComplete,
  onChange,
  describedBy,
  label = "password",
  required = true,
}: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  // Only a toggle after mount resolves the text, so it never blurs in on load.
  const [toggled, setToggled] = useState(false);
  const action = `${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`;

  return (
    <div className={arc.shell}>
      <input
        id={id}
        name={id}
        type={revealed ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={describedBy}
        data-reveal={toggled ? (revealed ? "shown" : "hidden") : undefined}
        className={arc.input}
      />
      <button
        type="button"
        onClick={() => {
          setRevealed((current) => !current);
          setToggled(true);
        }}
        aria-label={action}
        aria-pressed={revealed}
        aria-controls={id}
        // Arc's toggle is 30px; a phone gets the 44px floor.
        className="size-11 sm:size-8"
      >
        <EyeMorph slashed={revealed} />
      </button>
    </div>
  );
}
