"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { copyImagesToVariants, createProductVariants } from "@/actions/products";
import { FamilyPicker, type FamilyChoice } from "@/components/products/FamilyPicker";
import { GrowingListPicker } from "@/components/products/GrowingListPicker";
import { ManageLabelsLink } from "@/components/products/ManageLabelsLink";
import { StagedImages, type StagedImage } from "@/components/products/StagedImages";
import { VariantRows, type VariantRowState } from "@/components/products/VariantRows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useImageUploadQueue } from "@/hooks/useImageUploadQueue";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";
import { familyFromDraft, findFamilyCodeCollision } from "@/lib/product-families";
import type { FamilyOption } from "@/lib/queries/product-families";
import type { GrowingLabel } from "@/lib/queries/products";
import { generateSku, generateVariantSku, sizeInName } from "@/lib/sku";
import { rejectionReason } from "@/lib/validation/product-images";
import {
  MAX_VARIANT_ROWS,
  type ProductVariantsInput,
} from "@/lib/validation/product-variants";

/** Everything a set of variants share: one value each, entered once. */
type SharedInput = Omit<ProductVariantsInput, "variants">;

/**
 * Malaysia is the home market and a carton the unit everything ships in, so
 * both start filled rather than blank. Defaults, not assertions: "No market"
 * is the first option in its picker and the unit is an ordinary text field.
 */
const BLANK: SharedInput = {
  name: "",
  category: PRODUCT_CATEGORIES[0],
  unit: "carton",
  brand: null,
  packSize: "",
  cartonsPerPallet: "",
  market: "Malaysia",
  description: null,
  active: true,
  familyId: null,
  newFamily: null,
};

/** A row's price is inherited from the row above it; everything else is blank. */
const blankRow = (listPrice = ""): VariantRowState => ({
  key: crypto.randomUUID(),
  variant: null,
  sku: "",
  skuTouched: false,
  listPrice,
  staged: [],
});

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

/**
 * Creating a product, shaped like the product it will become.
 *
 * The chrome, the two-column band and the field order all come from
 * `/products/[id]` — the name sits where the name will sit, the list price
 * where the list price will sit — so the screen you fill in is the screen you
 * read afterwards. What is deliberately absent is everything downstream of a
 * sale: the six KPI tiles, the price trend, who-buys-it, bought-together and
 * the order history. A product that does not exist yet has no history, and six
 * em-dash tiles above an empty chart would be furniture rather than
 * information.
 *
 * Since Phase 39 the screen creates a product and **all of its flavours** in
 * one submit. Everything above is shared — brand, category, pack size, market,
 * description, family, active, and one set of pictures — and a row per variant
 * below carries the three things that genuinely differ. Those three live in
 * the details card while there is one variant, so a single-variant create is
 * the screen that existed before, and move into the Variants section the
 * moment a second row is added.
 *
 * The SKU proposes itself until the reader types one, at which point the field
 * is theirs — the customer's own list has no codes, so a generated one is the
 * common case and a hand-typed one the exception. With a family chosen it is
 * the family's code plus variant and market (`ZEN-SC-2100-GM-VN`, Phase 36);
 * with none it falls back to brand, category, the size in the name, variant
 * and market, as it did before families existed. Each row proposes its own,
 * and typing in one row's field stops the proposal for that row alone.
 *
 * Since Phase 27 a product cannot be created without a picture. The files are
 * staged in the browser and uploaded immediately after the rows are written,
 * because presign needs a `productId` that does not exist until then. That
 * order has one consequence worth knowing: if the rows are written and the
 * uploads then fail, the products exist. They are not deleted — a rollback
 * could not cover a browser closed mid-upload either — so the form says what
 * happened and links to them, where `ProductImageManager` finishes the job.
 *
 * Editing stays in `ProductSheet`. A drawer is right for changing one field on
 * a product you are already looking at; a page is right for entering eleven.
 */
export function ProductForm({
  labels,
  families,
}: {
  labels: Record<GrowingLabel, string[]>;
  families: FamilyOption[];
}) {
  const { pending: navigating, push } = useUrlNavigation();
  const [form, setForm] = useState<SharedInput>(BLANK);
  const [rows, setRows] = useState<VariantRowState[]>([blankRow()]);
  const [family, setFamily] = useState<FamilyChoice>({ familyId: null, draft: null });
  /** True while the open family draft is one `addRow` opened by itself and the
      reader has not touched since — which is what makes it withdrawable. */
  const [familyAutoOpened, setFamilyAutoOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  const [staged, setStaged] = useState<(StagedImage & { file: File })[]>([]);
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([]);
  /** A row's own refusals, keyed by that row, so one row's rejected file is
      reported beside its own dropzone rather than in the shared panel. */
  const [rowRejected, setRowRejected] = useState<
    Record<string, { name: string; reason: string }[]>
  >({});
  /** Set once the rows exist. Non-empty while still on this page means the
      products were created and their images were not — the one state this form
      cannot resolve itself. */
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const [createdFamilyId, setCreatedFamilyId] = useState<string | null>(null);
  const { rows: uploadRows, add } = useImageUploadQueue(() => {});

  const many = rows.length > 1;

  // Object URLs are revoked on removal and again on unmount, through refs so
  // the cleanup does not re-run on every staged change and revoke live ones.
  // Both lists, because a row's pictures are object URLs too.
  const stagedRef = useRef(staged);
  const rowsRef = useRef(rows);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  /**
   * Every row write goes through here, and `rowsRef` is kept in step
   * synchronously rather than only by the effect above, which lands after the
   * commit. Two events inside one commit — two drops on one row's dropzone —
   * would otherwise each compute from the same `rows`, and the second would
   * replace the first, losing its files and leaking the object URLs nothing
   * has revoked.
   */
  const updateRows = (next: (current: VariantRowState[]) => VariantRowState[]) => {
    const value = next(rowsRef.current);
    rowsRef.current = value;
    setRows(value);
  };
  useEffect(
    () => () => {
      for (const image of stagedRef.current) URL.revokeObjectURL(image.url);
      for (const row of rowsRef.current) {
        for (const image of row.staged) URL.revokeObjectURL(image.url);
      }
    },
    [],
  );

  /**
   * One rejection rule for the shared dropzone and every row's, so a file the
   * shared panel refuses is refused the same way inside a row.
   */
  const acceptFiles = (files: File[], alreadyStaged: number) => {
    const accepted: (StagedImage & { file: File })[] = [];
    const refused: { name: string; reason: string }[] = [];
    for (const file of files) {
      // Counted against what is already staged plus what this batch has taken,
      // which is the same arithmetic the server applies to existing rows.
      const reason = rejectionReason(file, alreadyStaged + accepted.length);
      if (reason) {
        refused.push({ name: file.name, reason });
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        name: file.name,
        url: URL.createObjectURL(file),
        file,
      });
    }
    return { accepted, refused };
  };

  const addFiles = (files: File[]) => {
    const { accepted, refused } = acceptFiles(files, staged.length);
    if (accepted.length > 0) setStaged((current) => [...current, ...accepted]);
    setRejected(refused);
  };

  const moveImage = (index: number, delta: number) =>
    setStaged((current) => {
      const next = [...current];
      const to = index + delta;
      if (to < 0 || to >= next.length) return current;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const removeImage = (index: number) =>
    setStaged((current) => {
      const going = current[index];
      if (going) URL.revokeObjectURL(going.url);
      return current.filter((_, at) => at !== index);
    });

  const patchRow = (key: string, patch: Partial<VariantRowState>) =>
    updateRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  /**
   * The reader's own family choice, from the picker. It ends the draft's
   * borrowed status: a family picked or typed into is theirs, and survives the
   * row that happened to be on screen when it was opened.
   */
  const chooseFamily = (next: FamilyChoice) => {
    setFamily(next);
    setFamilyAutoOpened(false);
  };

  /**
   * A new row inherits the price above it: a range is usually priced alike.
   * The second row also opens the family disclosure with the product's name in
   * it, because two variants need a family (§2 of the spec) and the moment a
   * person adds the second row is the moment they need to describe one. A
   * family already picked or drafted is left exactly as it is, flag included —
   * a third row must not re-open or re-claim a draft the reader has edited.
   */
  const addRow = () => {
    updateRows((current) => [...current, blankRow(current.at(-1)?.listPrice ?? "")]);
    if (!many && !family.familyId && !family.draft) {
      setFamily({ familyId: null, draft: { name: form.name, size: "", qualifier: "" } });
      setFamilyAutoOpened(true);
    }
  };

  const removeRow = (key: string) => {
    const current = rowsRef.current;
    const going = current.find((row) => row.key === key);
    if (!going || current.length === 1) return;
    const left = current.filter((row) => row.key !== key);

    for (const image of going.staged) URL.revokeObjectURL(image.url);

    // Back to one variant, which takes the Variants section off the screen —
    // and with it the only place the surviving row's own pictures are visible.
    // They become the shared set rather than invisible files that still drive
    // the write: what is on screen is what is uploaded, which is what the
    // Create gate already assumes. Ownership of the object URLs moves with
    // them, so none is revoked here and none leaks.
    const survivor = left[0];
    if (left.length === 1 && survivor.staged.length > 0) {
      const adopted = survivor.staged;
      setStaged((currentStaged) => [...currentStaged, ...adopted]);
      updateRows(() => [{ ...survivor, staged: [] }]);
    } else {
      updateRows(() => left);
    }

    // The draft `addRow` opened by itself goes when the last extra row goes.
    // Undoing an action must not leave a `ProductFamily` behind that nobody
    // asked for — and only the return to a single row withdraws it, because at
    // two rows the family is still required. Independent of the transfer
    // above: both happen on this transition, and neither reads the other.
    if (left.length === 1 && familyAutoOpened) {
      setFamily({ familyId: null, draft: null });
      setFamilyAutoOpened(false);
    }
  };

  const addRowFiles = (key: string, files: File[]) => {
    const row = rowsRef.current.find((candidate) => candidate.key === key);
    if (!row) return;
    const { accepted, refused } = acceptFiles(files, row.staged.length);
    if (accepted.length > 0) {
      updateRows((current) =>
        current.map((candidate) =>
          candidate.key === key
            ? { ...candidate, staged: [...candidate.staged, ...accepted] }
            : candidate,
        ),
      );
    }
    setRowRejected((current) => ({ ...current, [key]: refused }));
  };

  const moveRowImage = (key: string, index: number, delta: number) =>
    updateRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const next = [...row.staged];
        const to = index + delta;
        if (to < 0 || to >= next.length) return row;
        [next[index], next[to]] = [next[to], next[index]];
        return { ...row, staged: next };
      }),
    );

  const removeRowImage = (key: string, index: number) =>
    updateRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const going = row.staged[index];
        if (going) URL.revokeObjectURL(going.url);
        return { ...row, staged: row.staged.filter((_, at) => at !== index) };
      }),
    );

  const set = <K extends keyof SharedInput>(key: K, value: SharedInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const productFacts = { brand: form.brand ?? null, category: form.category };
  const newFamily = family.draft ? familyFromDraft(family.draft, productFacts) : null;
  const familyCode =
    families.find((entry) => entry.id === family.familyId)?.code ?? newFamily?.code ?? null;
  /**
   * A drafted family whose code already belongs to another one — computed
   * here, once, rather than inside `FamilyPicker`, because the submit button
   * below has to agree with the picker's own warning on exactly this value.
   */
  const familyCollision = newFamily ? findFamilyCodeCollision(newFamily.code, families) : null;

  /**
   * The code a row takes while nobody has typed one into it. Identical
   * arithmetic to the single-product form's — the family's code plus this
   * row's flavour and the shared market, falling back to brand, category and
   * the size in the name where there is no family.
   */
  const suggestedSku = (row: VariantRowState) =>
    familyCode
      ? generateVariantSku(familyCode, {
          variant: row.variant,
          market: form.market ?? null,
        })
      : generateSku({
          ...productFacts,
          size: sizeInName(form.name),
          variant: row.variant,
          market: form.market ?? null,
        });

  const skuOf = (row: VariantRowState) => (row.skuTouched ? row.sku : suggestedSku(row));

  const first = rows[0];

  // The eyebrow reads exactly as the detail page's does, filling in as the
  // fields are typed, so the placeholders show what each one becomes. The SKU
  // leads it while there is one variant; with several there is no one code to
  // print, so the family's takes its place.
  const eyebrow = [
    many ? null : skuOf(first) || "SKU",
    familyCode,
    form.category,
    form.packSize ? `${form.packSize} per ${form.unit || "carton"}` : `per ${form.unit || "unit"}`,
    form.market,
  ]
    .filter(Boolean)
    .join(" · ");

  // Held through the redirect as well as the write: releasing it the moment
  // the action returns would spin the button down while the detail page is
  // still being fetched, which is the failure the avatar work ran into.
  const busy = saving || navigating;

  /**
   * Phase 27's rule, counted across rows: every product must land with a
   * picture, and there are two ways for that to be true — a shared set, or
   * pictures on every row that has none of the shared ones.
   */
  const everyRowCovered =
    staged.length > 0 || rows.every((row) => row.staged.length > 0);

  /**
   * The other reason Create can be blocked: the drafted family's code is
   * already someone else's. Same shape as `everyRowCovered` — a boolean the
   * button and its caption both read — because the server would refuse the
   * submit anyway (the collision is a real unique constraint), and refusing
   * it here means the reader finds out from the warning under Qualifier
   * instead of from a round trip that discards nothing but their patience.
   */
  const blockedByFamilyCollision = familyCollision !== null;

  /**
   * Rows first, then pictures — Phase 27's order, because presign hangs a
   * `ProductImage` on a `productId` that does not exist until the rows are
   * written. Then, in this order:
   *
   * 1. every row that staged its own pictures gets them, so the first of them
   *    holds position 0 and stays that variant's cover;
   * 2. the shared set, if there is one, goes to **every** row — not only to
   *    rows that staged none. Someone who supplies range shots *and* a picture
   *    per flavour means both, and silently dropping the range shots after the
   *    header counted them is the worst of the readings available;
   * 3. it is uploaded once and copied, because eight rows' worth of the same
   *    photographs over a phone's uplink is the difference between a submit
   *    and a timeout. `copyImagesToVariants` appends past whatever a target
   *    already holds, so a row keeps its own cover and gains the shared set
   *    after it.
   *
   * The row it is uploaded to has to be one that staged nothing of its own:
   * the copy takes everything the source holds, so a source carrying its own
   * bottle shot would spread that shot across its siblings. Where every row
   * staged its own there is no such row, and the shared set is uploaded per
   * row instead — the rare shape, and correctness there is worth more than the
   * bytes.
   */
  const submit = async () => {
    setSaving(true);

    const result = await createProductVariants({
      ...form,
      familyId: family.familyId,
      newFamily,
      variants: rows.map((row) => ({
        variant: row.variant,
        sku: skuOf(row),
        listPrice: row.listPrice,
      })),
    });
    if (!result.success) {
      setSaving(false);
      toast.error(result.error);
      return;
    }

    const created = result.data.variants;
    const familyId = result.data.familyId;
    let uploaded = 0;
    let failed = 0;

    // Own pictures first, so a row that has them keeps its own cover.
    for (const [index, row] of rows.entries()) {
      const id = created[index]?.id;
      if (!id || row.staged.length === 0) continue;
      const outcome = await add(
        id,
        row.staged.map((image) => image.file),
        0,
      );
      uploaded += outcome.uploaded;
      failed += outcome.failed;
    }

    if (staged.length > 0) {
      const files = staged.map((image) => image.file);
      const clean = rows.findIndex((row) => row.staged.length === 0);
      const source = clean >= 0 ? created[clean] : undefined;

      if (source) {
        const outcome = await add(source.id, files, 0);
        uploaded += outcome.uploaded;
        failed += outcome.failed;

        const targets = created.filter((entry) => entry.id !== source.id);
        if (outcome.uploaded > 0 && targets.length > 0) {
          const copy = await copyImagesToVariants(
            source.id,
            targets.map((entry) => entry.id),
          );
          // Both counts are images, never products: a failed copy of three
          // pictures onto two siblings is six missing pictures.
          if (!copy.success) failed += targets.length * staged.length;
          else failed += copy.data.failed;
        } else if (targets.length > 0) {
          // Nothing landed to copy, so every other row is short the whole
          // shared set too.
          failed += targets.length * staged.length;
        }
      } else {
        // Every row staged its own, so there is no clean copy source. Counted
        // against what each row already holds, which is the limit the server
        // applies.
        for (const [index, row] of rows.entries()) {
          const id = created[index]?.id;
          if (!id) continue;
          const outcome = await add(id, files, row.staged.length);
          uploaded += outcome.uploaded;
          failed += outcome.failed;
        }
      }
    }

    if (failed > 0) {
      setSaving(false);
      setCreatedIds(created.map((variant) => variant.id));
      setCreatedFamilyId(familyId);
      toast.error(
        uploaded > 0
          ? `${created.length === 1 ? "Product" : "Variants"} created — ${failed} image${failed === 1 ? "" : "s"} didn't upload`
          : `${created.length === 1 ? "Product" : "Variants"} created, but the images didn't upload`,
      );
      return;
    }

    toast.success(
      created.length === 1 ? "Product created" : `${created.length} variants created`,
    );
    push(
      familyId && created.length > 1
        ? `/products?family=${familyId}`
        : `/products/${created[0].id}`,
    );
  };

  return (
    <>
      {/* Not `PageHeader`: the title here is the Name field rather than text,
          and an `<input>` cannot live inside its `<h1>`. Everything else about
          the row — the wrap, the `min-w-0`, the eyebrow — is copied from it so
          the two headers line up. */}
      <header className="mb-lg flex flex-col items-stretch gap-md sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-md sm:gap-y-sm">
        <div className="min-w-0 flex-1">
          <p className={label}>{eyebrow}</p>
          <h1 className="sr-only">New product</h1>
          <Input
            aria-label="Product name"
            placeholder="Product name"
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            className="h-auto rounded-none border-0 border-b border-hairline-strong px-0 py-xxs font-display text-[length:var(--text-heading-md)] leading-[1.2] font-[650] tracking-[-0.91px] text-ink placeholder:text-ink-disabled focus-visible:border-focus focus-visible:ring-0 sm:text-[length:var(--text-display-md)] sm:tracking-[-1.36px] md:text-[length:var(--text-display-md)]"
          />
        </div>
        <div className="flex flex-col items-stretch gap-xxs sm:shrink-0 sm:items-end">
          {createdIds.length > 0 ? (
            // The rows exist and their images do not. Creating again would make
            // a second set of products, so the only move offered is the one
            // that fixes the first.
            <Button asChild>
              <Link
                href={
                  createdIds.length > 1 && createdFamilyId
                    ? `/products?family=${createdFamilyId}`
                    : `/products/${createdIds[0]}`
                }
              >
                {createdIds.length > 1 ? "Open the products" : "Open the product"}
              </Link>
            </Button>
          ) : (
            <Button
              pending={busy}
              disabled={!everyRowCovered || blockedByFamilyCollision}
              onClick={submit}
              className="self-start sm:self-auto"
            >
              {busy ? "Creating…" : many ? "Create variants" : "Create product"}
            </Button>
          )}
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            {createdIds.length > 0
              ? createdIds.length > 1
                ? "Finish adding their images there"
                : "Finish adding its images there"
              : blockedByFamilyCollision
                ? "That family code is already in use — see the note below"
                : !everyRowCovered
                  ? "Add at least one image"
                  : staged.length > 0
                    ? `${staged.length} shared ${staged.length === 1 ? "image" : "images"} ready`
                    : "Each variant has its own images"}
          </p>
        </div>
      </header>

      <div className="grid gap-lg lg:grid-cols-[5fr_7fr]">
        {/* The gallery's slot, holding the pictures the product will have.
            `self-start` (inside `StagedImages`), or the grid stretches it to
            the card's height — the blow-out of 2026-09-09. It carries no
            aspect ratio of its own for the same reason: its height is however
            many tiles are staged. */}
        <div className="min-w-0">
          <StagedImages
            staged={staged}
            rows={uploadRows}
            rejected={rejected}
            busy={busy}
            onFiles={addFiles}
            onMove={moveImage}
            onRemove={removeImage}
          />
        </div>

        <section className="rounded-lg border border-hairline bg-canvas p-lg">
          {/* The three fields that differ per variant live here while there is
              one of them — so a single-variant create is the screen that
              existed before Phase 39 — and move into the Variants table the
              moment a second row is added. Never both: a value editable in two
              places is a value that can disagree with itself. */}
          {many ? (
            <div className="flex flex-col gap-xxs">
              <span className={label}>List price</span>
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                Priced per variant below
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-xxs">
              <label htmlFor="product-price" className={label}>
                List price
              </label>
              <div className="flex items-baseline gap-xs">
                <span className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink-tertiary">
                  RM
                </span>
                <Input
                  id="product-price"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={first.listPrice}
                  onChange={(event) =>
                    patchRow(first.key, { listPrice: event.target.value })
                  }
                  className="h-auto rounded-none border-0 border-b border-hairline-strong px-0 py-xxs font-display text-[length:var(--text-display-md)] leading-[1.2] font-[650] tracking-[-1.36px] text-ink tabular-nums placeholder:text-ink-disabled focus-visible:border-focus focus-visible:ring-0 md:text-[length:var(--text-display-md)]"
                />
              </div>
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                Recorded as the first entry in this product&rsquo;s price history
              </p>
            </div>
          )}

          <div className="mt-md flex flex-col gap-xxs">
            <label htmlFor="product-description" className={label}>
              Description
            </label>
            <Textarea
              id="product-description"
              rows={3}
              value={form.description ?? ""}
              onChange={(event) => set("description", event.target.value)}
            />
          </div>

          {/* The positions the detail page's `dl` uses, as controls. */}
          <div className="mt-md grid gap-md sm:grid-cols-2">
            {/* First, and full width: the family is the product this row is a
                variant of, and it decides the SKU proposed below. */}
            <div className="flex flex-col gap-xxs sm:col-span-2">
              <span className={label}>Family</span>
              <FamilyPicker
                families={families}
                value={family}
                brand={form.brand ?? null}
                category={form.category}
                collision={familyCollision}
                onChange={chooseFamily}
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                {many
                  ? "Required with more than one variant, so the shop shows them as one product"
                  : "The product this is a variant of — Zen Garden Shower Cream 2.1L, across every market"}
              </p>
            </div>

            <div className="flex flex-col gap-xxs">
              <span className={label}>Brand</span>
              <GrowingListPicker
                label="Brand"
                value={form.brand ?? null}
                known={labels.brand}
                onChange={(brand) => set("brand", brand)}
              />
              <ManageLabelsLink hint="Type to add one" />
            </div>

            <div className="flex flex-col gap-xxs">
              <span className={label}>Variant</span>
              {many ? (
                <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                  One per variant, below
                </p>
              ) : (
                <>
                  <GrowingListPicker
                    label="Variant"
                    value={first.variant}
                    known={labels.variant}
                    onChange={(variant) => patchRow(first.key, { variant })}
                  />
                  <ManageLabelsLink hint="Fragrance or formulation — type to add one" />
                </>
              )}
            </div>

            <div className="flex flex-col gap-xxs">
              <span className={label}>Category</span>
              <GrowingListPicker
                label="Category"
                value={form.category}
                known={labels.category}
                required
                // Required, unlike its three siblings: clearing it back to
                // "No category" would fail the schema, so the picker keeps
                // whatever was chosen last.
                onChange={(category) => set("category", category ?? form.category)}
              />
              <ManageLabelsLink hint="What kind of product it is — type to add one" />
            </div>

            <div className="flex flex-col gap-xxs">
              <span className={label}>Market</span>
              <GrowingListPicker
                label="Market"
                value={form.market ?? null}
                known={labels.market}
                onChange={(market) => set("market", market)}
              />
              <ManageLabelsLink hint="Country or customer it’s made for — type to add one" />
            </div>

            <div className="flex flex-col gap-xxs">
              <label htmlFor="product-pack" className={label}>
                Pack size
              </label>
              <Input
                id="product-pack"
                inputMode="numeric"
                placeholder="6"
                value={form.packSize === null ? "" : String(form.packSize)}
                onChange={(event) => set("packSize", event.target.value)}
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                Pieces per {form.unit || "carton"}
              </p>
            </div>

            <div className="flex flex-col gap-xxs">
              <label htmlFor="product-pallet" className={label}>
                Cartons per pallet
              </label>
              <Input
                id="product-pallet"
                inputMode="numeric"
                placeholder="60"
                value={
                  form.cartonsPerPallet === null ? "" : String(form.cartonsPerPallet)
                }
                onChange={(event) => set("cartonsPerPallet", event.target.value)}
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                As printed on the label — 60CTNS/PALLET
              </p>
            </div>

            <div className="flex flex-col gap-xxs">
              <label htmlFor="product-unit" className={label}>
                Unit
              </label>
              <Input
                id="product-unit"
                placeholder="carton"
                value={form.unit}
                onChange={(event) => set("unit", event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-xxs sm:col-span-2">
              {many ? (
                <>
                  <span className={label}>SKU</span>
                  <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                    One per variant, below
                  </p>
                </>
              ) : (
                <>
                  <label htmlFor="product-sku" className={label}>
                    SKU
                  </label>
                  <Input
                    id="product-sku"
                    value={skuOf(first)}
                    // Upper-cased as typed, so two people cannot enter the same
                    // SKU two ways and create a duplicate the schema would
                    // reject.
                    onChange={(event) =>
                      patchRow(first.key, {
                        skuTouched: true,
                        sku: event.target.value.toUpperCase(),
                      })
                    }
                  />
                  <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                    {first.skuTouched
                      ? "Capitals, digits and dashes"
                      : familyCode
                        ? "Suggested from the family code, variant and market — type to override"
                        : "Suggested from brand, category, the size in the name, variant and market — type to override"}
                  </p>
                </>
              )}
            </div>
          </div>

          <label className="mt-md flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink">
            <Switch
              checked={form.active}
              onCheckedChange={(value) => set("active", value === true)}
            />
            Active
          </label>

          <div className="mt-lg border-t border-hairline pt-lg">
            <div className="flex items-baseline justify-between gap-sm">
              <h2 className="text-[length:var(--text-heading-sm)] font-[650] text-ink">
                Variants
              </h2>
              <span className="text-[length:var(--text-caption)] text-ink-tertiary">
                {rows.length} {rows.length === 1 ? "variant" : "variants"}
              </span>
            </div>

            {many ? (
              <VariantRows
                rows={rows}
                knownVariants={labels.variant}
                suggestedSku={suggestedSku}
                busy={busy}
                rejected={rowRejected}
                onPatch={patchRow}
                onRemove={removeRow}
                onFiles={addRowFiles}
                onMoveImage={moveRowImage}
                onRemoveImage={removeRowImage}
              />
            ) : null}

            <Button
              type="button"
              variant="outline"
              disabled={busy || rows.length >= MAX_VARIANT_ROWS}
              onClick={addRow}
              // `outline` carries no height or horizontal padding of its own —
              // every other stepped control in the app (`ChoiceButton`,
              // `SortSelect`, the toolbar selects) is `h-control-md
              // sm:h-control-sm`, 44px at 390 and 36px from `sm` up, so this
              // one follows suit rather than sitting at the browser's default
              // button height (measured 22px before this).
              className="mt-md h-control-md px-md sm:h-control-sm"
            >
              + Add variant
            </Button>
            <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
              {rows.length >= MAX_VARIANT_ROWS
                ? `${MAX_VARIANT_ROWS} is the most in one go`
                : "Another flavour of the same product — it shares everything above"}
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
