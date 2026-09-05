# Phase 03 — Upload to R2

Branch `feature/upload`. Depends on: 02. Screen: design reference §3.3.

Goal: a signed-in user drops PDF/PNG/JPG files, each uploads straight to R2
with a progress bar, and a `Document` row exists for each. Extraction is
Phase 04; in this phase the queue row stops at "Uploaded" and the complete
route only records the document.

## 1. Route handlers

**`POST /api/upload/presign`** — body `{ files: [{ name, type, size }] }`
(max 10 per call). Validates each: `type ∈ {application/pdf, image/png, image/jpeg}`,
`size ≤ 20 MB`, name ≤ 255 chars. For each file: create a `Document` row
with `r2Key = documentKey(id, ext)`, `originalName`, `mimeType`, `sizeBytes`,
`uploadedById`; return `{ documentId, url, key, expiresAt }` with a presigned
PUT (15 min, `ContentType` pinned, `ContentLength` pinned). Rejected files
come back in `errors: [{ name, reason }]` and the rest proceed.

**`POST /api/upload/complete`** — body `{ documentId }`. Verifies the document
belongs to the caller and has no `Extraction` yet, `HEAD`s the object,
checks `ContentLength === sizeBytes` and `ContentType === mimeType` (else
deletes the row and returns 400 "Upload did not complete"). Creates
`Extraction { status: PENDING }` and returns `{ extractionId }`. Phase 04
extends this handler to run extraction; leave the `maxDuration = 120` export
in place now.

Orphans: a `Document` with no `Extraction` after 1 hour is garbage. Add
`src/lib/queries/documents.ts#deleteOrphans()` and call it opportunistically
from the presign handler (1 in 20 calls); it deletes the R2 object if present.

## 2. Client — `/upload`

**Entry point (G1).** `/upload` is not a navigation destination: the sidebar
is Dashboard, Purchase orders, Buyers, Products and nothing else. The only way
in is the "Upload PO" primary button in the page header of Dashboard, Purchase
orders, Buyers and Buyer detail. While `/upload` is open the sidebar shows
**Purchase orders** as the active item. Do not add an Upload row to the
sidebar, and do not rely on one existing for the back-out path: "Cancel"
returns to `/purchase-orders`.

`Dropzone` + `UploadQueue` components. Files are accepted by drop, by
"Browse files" (`<input type=file multiple accept=".pdf,.png,.jpg,.jpeg">`),
and by paste. Client-side pre-check of type and size gives an immediate
"Failed — PDF, PNG or JPG up to 20 MB" row without calling the server.

Per file, a state machine in `useUploadQueue`:

```
queued → presigning → uploading(progress) → completing → uploaded
                                     ↘ failed(reason)  (Retry restarts from presigning)
```

Upload with `XMLHttpRequest` (needed for `upload.onprogress`), `PUT`, header
`Content-Type` only. Three uploads run concurrently; the rest wait. A
`beforeunload` warning while anything is uploading.

**Progress bars have one geometry.** Every bar in the queue is 4px tall, full
width of the row, a `surface-soft` track with `rounded-pill` on both track and
fill. Nothing else varies between states: only the fill colour and the row's
status label distinguish them — `bg-ink` while uploading, `accent-blue` while
extracting (Phase 04; blue means a process in flight, G2). No state gets a
taller bar, a different radius, a stripe or a shimmer. Row badge per design
reference §3.3, and every state keeps its text label.

**Failure rows carry a reason.** A `failed` row shows a one-line explanation
directly under the filename in `text-caption` `text-ink-tertiary` — plain
language, not an error code — beside its Retry action. Store it as the row's
`reason` in the queue state and map every rejection to one, for example
"Couldn't read the PDF — it may be a scan with no text layer", "File too
large — 24.1 MB, limit is 20 MB", "That file type isn't supported — PDF, PNG
or JPG". Client pre-check failures, presign rejections (`errors[].reason`) and
complete-route failures all populate the same line. Removing a row (×) during
upload aborts the XHR and calls `DELETE /api/upload/[documentId]` (add this
small handler: owner-only, deletes the R2 object and the row while no
`Extraction` exists).

Sticky footer with the page's dark pill appears once any file has reached the
queue's ready terminal state ("Uploaded" in this phase, "Ready to review" once
Phase 04 lands): "Review 3 files" → Phase 04 wires it to
`/review/[firstExtractionId]`; in this phase it links to `/purchase-orders`.

**The footer count is N ready rows only.** N counts rows in the ready state
and nothing else — never `failed`, never `uploading`, never `extracting`,
never `queued`. When N is 0 the pill renders disabled (not hidden) so the
footer does not jump. Beside the pill, a `text-caption` `text-ink-tertiary`
line names what was left out whenever some rows are excluded, e.g. "Not
included: 1 still uploading · 1 failed"; with nothing excluded the caption is
omitted.

`?buyer=<id>` on the URL (from buyer detail's "Upload PO") is carried through
to the complete call as `hintBuyerId` and stored in `Extraction.draftJson.buyerId`
so the review screen preselects it.

## 3. Tests

- Vitest: `validation/upload.test.ts` (types, size, count); `r2.documentKey`
  formats the KL-time path.
- Manual: throttle the network in devtools to see progress; kill the tab
  mid-upload and confirm `deleteOrphans` clears it later.

## 4. Acceptance criteria

1. Dropping three files shows three rows uploading concurrently with live
   progress and ending in "Uploaded".
2. A 25 MB file and a `.docx` are refused client-side with the reason in the row.
3. The R2 bucket shows objects at `po/2026/09/<id>.pdf` with the right
   `Content-Type`; the `Document` rows match.
4. Tampering the presigned URL's key or content type is rejected by R2 (403).
5. A presign for another user's `documentId` on complete returns 404.
6. Everything is keyboard-operable: Browse button, remove buttons, footer pill.
7. `/upload` is reachable only from an "Upload PO" button: the sidebar has no
   Upload row, and while `/upload` is open "Purchase orders" is the item shown
   as active.
8. With three files uploaded, one still uploading and one failed, the footer
   reads "Review 3 files" and the caption beside it reads "Not included: 1
   still uploading · 1 failed". With zero ready rows the pill is visible and
   disabled.
9. Every failed row shows a plain-language reason under the filename (a 25 MB
   file reads "File too large — 25.4 MB, limit is 20 MB") next to Retry.
10. All progress bars measure the same height and radius across uploading and
    extracting rows; only the fill colour and the status label differ.
11. Long filenames ellipsise but carry a `title` with the full name (G4).
