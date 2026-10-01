"use client";

import { useState } from "react";
import {
  PhoneInput,
  formatNational,
} from "@/components/arc/phone-input/phone-input";
import { phoneToE164 } from "@/lib/phone";

/** The countries this business's buyers and contacts are in, pinned first. */
const PREFERRED = ["MY", "SG", "ID", "TH", "VN", "PH"];

/**
 * Arc's phone input, Malaysia first, speaking the stored form: what goes back
 * to the caller is the international number as people write it
 * (`+60 12-345 6789`), not bare E.164, so a phone printed on a purchase order
 * or a buyer's card reads the way it was always stored. A number stored before
 * this field — `012-345 6789` — opens as the Malaysian number it is.
 *
 * Uncontrolled after mount: the field formats as it is typed, and feeding a
 * re-formatted string back on every keystroke would fight the caret. A caller
 * that clears the field remounts it with a new `key`.
 */
export function PhoneField({
  id,
  label,
  value,
  onChange,
  hideLabel = false,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  const [initial] = useState(() => phoneToE164(value));
  return (
    // Arc's label wears our label style, so it sits with the fields beside it.
    <div className="min-w-0 [&_label]:font-mono [&_label]:text-[length:var(--text-eyebrow)] [&_label]:font-normal [&_label]:text-ink-tertiary">
      <PhoneInput
        id={id}
        label={label}
        hideLabel={hideLabel}
        disabled={disabled}
        defaultValue={initial}
        defaultCountry="MY"
        preferredCountries={PREFERRED}
        onValueChange={(e164, details) =>
          onChange(
            e164
              ? `+${details.country.dial} ${formatNational(
                  details.country,
                  e164.slice(1 + details.country.dial.length),
                )}`
              : "",
          )
        }
      />
    </div>
  );
}
