# Phase 68 — Container details: photos, videos and a description the buyer sees

**Goal:** Staff upload photos and videos of each loaded container with a
description; the buyer sees them on their order. Who uploaded and who last
edited, and when, is recorded and shown.

**Branch:** `feature/container-details`, from `main` after Phase 63
(containers belong to a shipment).

Asked for as (2026-10-16): "Container details — customer request this, want
to upload to the system and show them", then "Photos of container,
description, videos, need to show to buyer. Also show uploaded and edited by
who and when".

## 1. Data

```prisma
model Container {
  id             String   @id @default(cuid())
  shipmentId     String
  shipment       Shipment @relation(fields: [shipmentId], references: [id], onDelete: Cascade)
  /// As printed, e.g. "MSKU 123456-7". Optional until known.
  containerNo    String?
  sealNo         String?
  /// "20'GP", "40'HC" — free text, as BCs print it.
  size           String?
  description    String?
  createdById    String
  createdBy      User     @relation("containersCreated", fields: [createdById], references: [id])
  createdAt      DateTime @default(now())
  updatedById    String?
  updatedBy      User?    @relation("containersUpdated", fields: [updatedById], references: [id], onDelete: SetNull)
  updatedAt      DateTime @updatedAt
  media          ContainerMedia[]

  @@index([shipmentId])
}

model ContainerMedia {
  id             String    @id @default(cuid())
  containerId    String
  container      Container @relation(fields: [containerId], references: [id], onDelete: Cascade)
  kind           ContainerMediaKind // PHOTO | VIDEO
  r2Key          String    @unique  // containers/{containerId}/{uuid}.{ext}
  thumbKey       String?             // photos: a 600px WebP, as product images
  originalName   String
  mimeType       String
  sizeBytes      Int
  caption        String?
  position       Int
  uploadedById   String
  uploadedBy     User      @relation("containerMediaUploaded", fields: [uploadedById], references: [id])
  uploadedByName String
  uploadedAt     DateTime  @default(now())

  @@index([containerId, position])
}
```

A shipment has one or more containers. Every edit to a container's fields
sets `updatedById`; every add/remove of media writes an `AuditEvent`
(`CONTAINER_*`), shown in the shipment's activity (Phase 64).

## 2. Files

- **Photos:** JPG, PNG, HEIC (iPhone), 15 MB each. A 600px WebP thumbnail is
  made on complete with `sharp().rotate()` — the product-image path; its
  route joins `SHARP_ROUTES` with a `**` glob (the 2026-09-09 lesson: `[id]`
  in a tracing key matches one character). HEIC is converted to JPEG on
  complete so every browser shows it.
- **Videos:** MP4, MOV, WebM, **200 MB** each. Uploaded browser → R2 directly
  (presign/PUT/complete), so size never touches a Vercel function. Played with
  a native `<video controls preload="metadata">` from a 10-minute presigned
  URL; no transcoding. A MOV from an iPhone plays in Safari and Chrome on Mac;
  **Android Chrome may not play HEVC** — say so under the upload ("If it
  won't play on a phone, export as MP4").
- Up to 30 files per container, many at once with per-file progress (the PO
  upload queue's `useUploadQueue`).
- Reorder with arrows and Make cover, as product images.

## 3. Staff screen (shipment page)

A **Containers** card under Documents on `/shipments/[id]`:

- One block per container: number, seal, size, description (edit inline, Save),
  then the media grid — photo thumbnails and video tiles with a play badge and
  duration. Tap opens a viewer (photos zoom, videos play), with Download.
- Under each tile: `uploader · date`. Under the container's fields:
  "Added by Rina Tan · 14 Oct 2026 · Last edited by Aisha Rahman · 15 Oct
  2026, 10:12".
- **Add container**, **Add photos or videos** (also drop onto the block),
  **Delete** on a tile and on a container (confirm; deletes R2 objects after
  the rows).
- Permission: `shipment.manage` to change, `shipment.view` to see.

## 4. Buyer screen

On the buyer's order page (`/orders/[id]`, shop host), a **Your container**
section appears once the order is on a shipment that has at least one
container with media:

- Container number, seal, size, description; the photo and video gallery
  with the same viewer and Download.
- **Who and when, for the buyer: dates only** — "Updated 15 Oct 2026". Staff
  names are not shown to buyers anywhere today (stage events reach the shop
  with `changedByName` forced null, Phase 16), and this keeps that rule.
  If the customer wants names shown to buyers, it is one field in the select.
- A shipment carries several POs of one buyer, so the same containers show on
  each of that buyer's orders on it.
- Media URLs come from a buyer-scoped route,
  `/api/shop/orders/[id]/containers/[mediaId]/url`: `requireClient()`, then
  the order's buyer must be the client's buyer and the media must belong to a
  container on a shipment carrying that order. Another buyer → 404.
- No shipping documents reach the buyer (Phase 63 decision 5); containers are
  the one exception, and they are photos and fields, not papers.

## 5. Acceptance

1. Staff upload 6 photos (one HEIC) and 2 videos (one 150 MB MP4, one MOV) to
   a container; thumbnails appear; the MP4 plays; uploader and date show on
   each tile.
2. Editing the description as another user changes "Last edited by" and its
   time.
3. As the buyer, the order page shows the container, gallery, description and
   dates — no staff name in the HTML; the video plays; another buyer's media
   URL answers 404; signed out 401.
4. Deleting a tile removes its R2 objects (both photo and thumbnail).
5. No overflow at 390 / 768 / 1440 on both pages; tiles and buttons 44px at
   390.
6. Tests, `tsc`, lint, build clean; the sharp route's `.nft.json` checked
   **and** the route probed on the preview with an unauthenticated POST (401
   from our JSON = sharp loaded; Next's 500 page = it did not).

## 6. Not verifiable here

A real phone's HEIC and MOV, real R2 at 200 MB, and Android playback of a
HEVC MOV. Ask the customer for one real container's photos and a video.
