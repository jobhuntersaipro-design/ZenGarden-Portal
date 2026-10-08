"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  retryBookingConfirmation,
  reviewBookingConfirmation,
} from "@/actions/booking-confirmations";
import { Field, ReadOnlyField } from "@/components/review/Field";
import { ReviewSplit } from "@/components/review/ReviewSplit";
import { Button } from "@/components/ui/button";
import { PersonChip } from "@/components/ui/person";
import { formatDateTime } from "@/lib/dates";
import {
  BOOKING_FIELDS,
  type BookingFields,
} from "@/lib/validation/booking-confirmations";

/** The form holds strings; a blank field is sent as "" and stored as null. */
export type BookingValues = Record<keyof BookingFields, string>;

const WIDE: ReadonlySet<keyof BookingFields> = new Set(["containers", "vesselTracking"]);

const isLink = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());

/**
 * One booking confirmation's fields beside its file. A reviewer corrects them
 * and saves, which marks the booking reviewed by them; anyone else reads them.
 */
export function BookingForm({
  id,
  document,
  status,
  error,
  initial,
  canReview,
  canRetry,
  reviewedBy,
}: {
  id: string;
  document: ReactNode;
  status: "EXTRACTING" | "NEEDS_REVIEW" | "FAILED" | "REVIEWED";
  error: string | null;
  initial: BookingValues;
  canReview: boolean;
  canRetry: boolean;
  reviewedBy: { name: string; image: string | null; at: string } | null;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const reading = status === "EXTRACTING";
  const editable = canReview && !reading;

  const onSave = async () => {
    setSaving(true);
    try {
      const result = await reviewBookingConfirmation(id, values);
      if (result.success) {
        toast.success(status === "REVIEWED" ? "Changes saved" : "Marked reviewed");
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ReviewSplit document={document}>
      <div className="@container flex min-w-0 flex-col gap-md">
        {reading ? (
          <p className="rounded-lg border border-hairline bg-surface-soft p-md text-[length:var(--text-body-sm)] text-ink-secondary">
            Claude is still reading this booking confirmation. Refresh in a moment.
          </p>
        ) : null}

        {status === "FAILED" ? (
          <div className="rounded-lg border border-hairline bg-surface-soft p-md">
            <p className="text-[length:var(--text-body-sm)] text-accent-red">
              {error ?? "We couldn't read this document."}
            </p>
            <p className="mt-xxs text-[length:var(--text-caption)] text-ink-secondary">
              {canReview
                ? "You can fill it in by hand and save, or try reading it again."
                : "Try reading it again, or ask a reviewer to fill it in by hand."}
            </p>
            {canRetry ? (
              <Button
                variant="secondary"
                className="mt-sm"
                pending={retrying}
                onClick={async () => {
                  setRetrying(true);
                  try {
                    const result = await retryBookingConfirmation(id);
                    if (!result.success) toast.error(result.error);
                    else if (result.data.status === "FAILED") {
                      toast.error(result.data.error ?? "We still couldn't read it.");
                    } else {
                      toast.success("Read again — check the fields");
                    }
                  } catch {
                    toast.error("We couldn't reach the server. Try again.");
                  } finally {
                    setRetrying(false);
                  }
                }}
              >
                {retrying ? "Reading again…" : "Try again"}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-md @md:grid-cols-2">
          {BOOKING_FIELDS.map(({ key, label, date }) => (
            <div key={key} className={`min-w-0 ${WIDE.has(key) ? "@md:col-span-2" : ""}`}>
              {editable ? (
                <Field
                  id={key}
                  label={label}
                  type={date ? "date" : "text"}
                  value={values[key]}
                  onChange={(value) => setValues((current) => ({ ...current, [key]: value }))}
                />
              ) : (
                <ReadOnlyField id={key} label={label} value={values[key]} />
              )}
              {key === "vesselTracking" && isLink(values.vesselTracking) ? (
                <a
                  href={values.vesselTracking.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-xxs inline-flex min-h-control-md items-center gap-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline sm:min-h-0"
                >
                  Open tracking link
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-sm border-t border-hairline pt-md">
          <div className="min-w-0 text-[length:var(--text-body-sm)] text-ink-secondary">
            {reviewedBy ? (
              <span className="flex flex-wrap items-center gap-xs">
                Reviewed by
                <PersonChip name={reviewedBy.name} image={reviewedBy.image} />
                <span className="text-ink-tertiary">· {formatDateTime(reviewedBy.at)}</span>
              </span>
            ) : (
              "Not reviewed yet"
            )}
          </div>
          {editable ? (
            <Button pending={saving} onClick={onSave}>
              {saving ? "Saving…" : status === "REVIEWED" ? "Save changes" : "Mark reviewed"}
            </Button>
          ) : null}
        </div>
      </div>
    </ReviewSplit>
  );
}
