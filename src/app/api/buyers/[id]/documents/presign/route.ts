import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { presignPut } from "@/lib/r2";
import {
  BUYER_DOCUMENT_TYPES,
  MAX_BUYER_DOCUMENTS_PER_CALL,
  buyerDocumentKey,
  documentPresignSchema,
  documentRejectionReason,
  resolveDocumentType,
} from "@/lib/validation/buyer-files";

export type PresignedBuyerDocument = {
  name: string;
  key: string;
  /** The type the PUT must declare: it is pinned into the signature. */
  type: string;
  url: string;
};
export type PresignBuyerDocumentsResponse = {
  files: PresignedBuyerDocument[];
  errors: { name: string; reason: string }[];
};

/**
 * Upload URLs for a batch of documents (2026-09-24). Straight to R2 from the
 * browser, as the PO intake does: a 25 MB contract would not fit a Vercel
 * function body. No row is written until `complete` has seen the object.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { denied } = await guardRoute("buyer.manage");
  if (denied) return denied;
  const { id: buyerId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }
  const parsed = documentPresignSchema.safeParse(body);
  if (!parsed.success) {
    const tooMany = parsed.error.issues.some((issue) => issue.path[0] === "files" && issue.code === "too_big");
    return NextResponse.json(
      {
        error: tooMany
          ? `Up to ${MAX_BUYER_DOCUMENTS_PER_CALL} files at a time.`
          : (parsed.error.issues[0]?.message ?? "Malformed request."),
      },
      { status: 400 },
    );
  }

  const buyer = await prisma.buyer.findUnique({ where: { id: buyerId }, select: { id: true } });
  if (!buyer) return NextResponse.json({ error: "That buyer is gone." }, { status: 404 });

  const response: PresignBuyerDocumentsResponse = { files: [], errors: [] };
  for (const file of parsed.data.files) {
    const reason = documentRejectionReason(file);
    const type = resolveDocumentType(file.name, file.type);
    if (reason || !type) {
      response.errors.push({ name: file.name, reason: reason ?? "That file type isn't supported" });
      continue;
    }
    const key = buyerDocumentKey(buyerId, randomUUID(), BUYER_DOCUMENT_TYPES[type].ext);
    try {
      response.files.push({ name: file.name, key, type, url: await presignPut(key, type, file.size) });
    } catch (cause) {
      console.error("[buyer-documents] presign failed", cause);
      response.errors.push({ name: file.name, reason: "We couldn't start that upload" });
    }
  }
  return NextResponse.json(response);
}
