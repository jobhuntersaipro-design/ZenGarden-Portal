import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { maybeDeleteOrphans } from "@/lib/queries/documents";
import { PENDING_KEY_PREFIX, documentKey, presignPut } from "@/lib/r2";
import {
  MAX_FILES_PER_CALL,
  TOO_MANY,
  type AcceptedMimeType,
  extensionFor,
  presignRequestSchema,
  rejectionReason,
} from "@/lib/validation/upload";

export type PresignedFile = {
  name: string;
  documentId: string;
  key: string;
  url: string;
  expiresAt: string;
};

export type PresignError = { name: string; reason: string };

export type PresignResponse = {
  files: PresignedFile[];
  errors: PresignError[];
};

/** Matches the presigned PUT's own lifetime in `src/lib/r2.ts`. */
const PUT_TTL_MS = 15 * 60_000;

/**
 * One rejected file does not sink the batch: the good ones come back in
 * `files`, the bad ones in `errors` with the reason the row will display
 * (docs/specs/03-upload.md §1).
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return NextResponse.json({ error: cause.message }, { status: 401 });
    }
    throw cause;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  // The array bound is checked before the per-file loop so a caller cannot ask
  // for a thousand presigned URLs in one go.
  if (
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { files?: unknown }).files) &&
    (body as { files: unknown[] }).files.length > MAX_FILES_PER_CALL
  ) {
    return NextResponse.json({ error: TOO_MANY }, { status: 400 });
  }

  const parsed = presignRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  void maybeDeleteOrphans();

  const files: PresignedFile[] = [];
  const errors: PresignError[] = [];
  const expiresAt = new Date(Date.now() + PUT_TTL_MS).toISOString();

  for (const file of parsed.data.files) {
    const reason = rejectionReason(file);
    if (reason) {
      errors.push({ name: file.name, reason });
      continue;
    }

    const mimeType = file.type as AcceptedMimeType;
    try {
      // The row is created first so the key can carry the document's own id,
      // which is what makes an abandoned upload identifiable later. That means
      // r2Key needs a value before the id exists, and r2Key is unique — so the
      // placeholder has to be unique too, or two files presigned at the same
      // moment would collide on it.
      const document = await prisma.document.create({
        data: {
          r2Key: `${PENDING_KEY_PREFIX}${randomUUID()}`,
          originalName: file.name,
          mimeType,
          sizeBytes: file.size,
          uploadedById: user.id,
        },
        select: { id: true },
      });
      const key = documentKey(document.id, extensionFor(mimeType));
      await prisma.document.update({
        where: { id: document.id },
        data: { r2Key: key },
      });

      files.push({
        name: file.name,
        documentId: document.id,
        key,
        url: await presignPut(key, mimeType, file.size),
        expiresAt,
      });
    } catch (cause) {
      console.error("[upload] presign failed", cause);
      errors.push({ name: file.name, reason: "We couldn't start that upload" });
    }
  }

  return NextResponse.json({ files, errors } satisfies PresignResponse);
}
