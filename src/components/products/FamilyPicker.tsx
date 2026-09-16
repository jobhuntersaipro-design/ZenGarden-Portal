"use client";

import { Combobox } from "@/components/review/Combobox";
import { Input } from "@/components/ui/input";
import { familyFromDraft, type FamilyDraft } from "@/lib/product-families";
import type { FamilyOption } from "@/lib/queries/product-families";

/** `Combobox` values for the two rows that are not a family. */
const NONE = "";
const NEW = "\u0000new";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

export type FamilyChoice = {
  familyId: string | null;
  /** Non-null while a new family is being described on this form. */
  draft: FamilyDraft | null;
  /**
   * The reader picked "No family", as opposed to never having picked
   * anything. `familyId: null` alone cannot tell the two apart, and on an
   * edit they mean opposite things — "work out which listing this joins"
   * against "take it out of the one it is in" — so a caller that has to say
   * which is happening reads this. Optional and meaningless on the create
   * form, where a product is in nothing to leave.
   */
  detach?: boolean;
};

/**
 * Which product this variant belongs to (Phase 36).
 *
 * An existing family is picked by code or name; a new one is described here
 * rather than on a separate screen, because the moment a person discovers a
 * family is missing is the moment they are entering its first variant.
 * Brand and category come from the product — a family cannot disagree with
 * its own variants on those — so the disclosure asks only for the name, the
 * size and, when the code would collide, a qualifier. The code it will take
 * is shown live; it can be edited later in the admin room.
 */
export function FamilyPicker({
  families,
  value,
  brand,
  category,
  collision = null,
  onChange,
}: {
  families: FamilyOption[];
  value: FamilyChoice;
  brand: string | null;
  category: string;
  /**
   * The existing family the drafted code already belongs to, or null. Passed
   * in rather than recomputed here so a caller that also gates a submit
   * button on it — `ProductForm` does — and this caption can never disagree
   * about whether one exists. Defaults to null for a caller that does not
   * (yet) compute it, such as the edit drawer, so this stays additive there.
   */
  collision?: FamilyOption | null;
  onChange: (next: FamilyChoice) => void;
}) {
  const options = families.map((family) => ({
    id: family.id,
    label: `${family.code} · ${family.name}`,
    hint: `${family.products}`,
  }));
  const selected = value.draft ? NEW : (value.familyId ?? NONE);
  const proposed = value.draft ? familyFromDraft(value.draft, { brand, category }) : null;
  const collisionId = "family-code-collision";

  const setDraft = (patch: Partial<FamilyDraft>) =>
    onChange({
      familyId: null,
      draft: { name: "", size: "", qualifier: "", ...value.draft, ...patch },
      detach: false,
    });

  return (
    <div className="flex flex-col gap-xs">
      <Combobox
        ariaLabel="Family"
        value={selected}
        placeholder="No family"
        options={[{ id: NONE, label: "No family" }, ...options]}
        pinned={[{ id: NEW, label: "+ Create a family…" }]}
        onSelect={(option) => {
          if (option.id === NEW) setDraft({});
          else if (option.id === NONE)
            // The only place `detach` is set: this row is a person saying
            // "no family", not the absence of a choice.
            onChange({ familyId: null, draft: null, detach: true });
          else onChange({ familyId: option.id, draft: null, detach: false });
        }}
      />

      {value.draft ? (
        <div className="grid gap-sm rounded-sm border border-hairline bg-surface-soft p-sm">
          <div className="flex flex-col gap-xxs">
            <label htmlFor="family-name" className={label}>
              Family name
            </label>
            <Input
              id="family-name"
              placeholder="Zen Garden Shower Cream 2.1L"
              value={value.draft.name}
              onChange={(event) => setDraft({ name: event.target.value })}
            />
            <p className={caption}>The product, across every market — no fragrance in it</p>
          </div>
          <div className="grid gap-sm sm:grid-cols-2">
            <div className="flex flex-col gap-xxs">
              <label htmlFor="family-size" className={label}>
                Size
              </label>
              <Input
                id="family-size"
                placeholder="2.1L"
                value={value.draft.size}
                onChange={(event) => setDraft({ size: event.target.value })}
              />
              <p className={caption}>ML, L, G or KG — or blank for a line with none</p>
            </div>
            <div className="flex flex-col gap-xxs">
              <label htmlFor="family-qualifier" className={label}>
                Qualifier
              </label>
              <Input
                id="family-qualifier"
                placeholder="Scrub"
                value={value.draft.qualifier}
                onChange={(event) => setDraft({ qualifier: event.target.value })}
                // Qualifier is the one field that resolves a collision — Size
                // and Family name are left alone even though the code is built
                // from more than the qualifier, because typing into either of
                // those changes what family this is, where a qualifier only
                // tells two same-shaped families apart. `aria-invalid` alone
                // gets the danger border and ring from the shared `Input`
                // styles (`aria-invalid:border-destructive`), the same rule
                // `Field` relies on for a review-screen error.
                aria-invalid={collision ? true : undefined}
                aria-describedby={collision ? collisionId : undefined}
              />
              <p className={caption}>Only when another family already has this code</p>
            </div>
          </div>
          <p className={caption}>
            Code{" "}
            <span className="font-mono text-ink">{proposed?.code || "—"}</span>
            {" · from "}
            {brand ?? "no brand"}, {category}
            {value.draft.size.trim() ? `, ${value.draft.size.trim()}` : ""}
          </p>
          {collision ? (
            <p id={collisionId} role="alert" className="text-[length:var(--text-caption)] text-accent-red">
              <span className="font-mono">{collision.code}</span> is already{" "}
              <strong className="font-semibold">{collision.name}</strong>. Pick that
              family above, or add a qualifier to tell them apart.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
