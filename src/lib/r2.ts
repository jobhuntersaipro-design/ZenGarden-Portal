import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { TIME_ZONE } from "@/lib/dates";
import { env } from "@/lib/env";

/** R2 speaks S3. Region is always `auto`; the account id picks the endpoint. */
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: false,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const PUT_TTL_SECONDS = 15 * 60;
const GET_TTL_SECONDS = 10 * 60;

/**
 * Upload URL for the browser. Content-Type and Content-Length are both pinned
 * into the signature, so a client that changes either is rejected by R2 rather
 * than by us. Size is checked once more on /api/upload/complete via headObject,
 * because a signature only proves what was declared, not what arrived.
 *
 * `sizeBytes` is the file's exact size, not a ceiling: S3 signs Content-Length
 * as an exact value, so passing a maximum here would reject every real upload
 * but one.
 */
export function presignPut(key: string, contentType: string, sizeBytes: number) {
  return getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    }),
    { expiresIn: PUT_TTL_SECONDS },
  );
}

/** Read URL for previews and downloads. `filename` forces a download name. */
export function presignGet(key: string, filename?: string) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ...(filename
        ? {
            ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
          }
        : {}),
    }),
    { expiresIn: GET_TTL_SECONDS },
  );
}

export function headObject(key: string) {
  return r2.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

/**
 * Write an object from the server (Phase 37).
 *
 * Every other upload in this app is presigned and performed by the browser,
 * because the bytes start there. A generated purchase order is the opposite
 * case: the bytes exist only on the server, and presigning a URL for
 * ourselves would be a round trip to sign a request we are about to make.
 */
export function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
) {
  return r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    }),
  );
}

/**
 * Server-side copy, so one uploaded photograph can serve every variant of a
 * product without the browser sending the bytes again (Phase 39). Eight
 * flavours of a 5 MB photograph is 40 MB up a phone's connection; this is one
 * upload and seven copies inside the bucket.
 *
 * `CopySource` is `{bucket}/{key}` and S3 requires it URI-encoded — the keys
 * this app writes are cuid-based and hold nothing that needs escaping, so
 * `encodeURI` is a no-op today and correct if that ever changes.
 */
export function copyObject(fromKey: string, toKey: string) {
  return r2.send(
    new CopyObjectCommand({
      Bucket: env.R2_BUCKET,
      CopySource: encodeURI(`${env.R2_BUCKET}/${fromKey}`),
      Key: toKey,
    }),
  );
}

/** `jpg` from `products/{productId}/{imageId}.jpg`; `jpg` as the fallback. */
export function extensionOfKey(key: string): string {
  const last = key.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : "jpg";
}

/** Whole object into memory — used to hand PDF bytes to Claude. */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const result = await r2.send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
  );
  if (!result.Body) throw new Error(`Empty object at ${key}`);
  return new Uint8Array(await result.Body.transformToByteArray());
}

export function deleteObject(key: string) {
  return r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

/**
 * A Document needs a unique `r2Key` at creation, before its id exists to build
 * the real key from. A key with this prefix is that placeholder: it names no
 * object, and nothing should ever try to delete one.
 */
export const PENDING_KEY_PREFIX = "pending:";

export const isPendingKey = (key: string) => key.startsWith(PENDING_KEY_PREFIX);

/** `po/2026/09/{documentId}.pdf`, foldered by KL date so listings stay usable. */
export function documentKey(documentId: string, ext: string): string {
  const now = new TZDate(new Date(), TIME_ZONE);
  const clean = ext.replace(/^\./, "").toLowerCase();
  return `po/${format(now, "yyyy")}/${format(now, "MM")}/${documentId}.${clean}`;
}

/**
 * `products/{productId}/{imageId}.jpg` — the original, exactly as uploaded.
 *
 * The original is kept rather than discarded once the derivative exists:
 * re-deriving a larger rendition later must not mean asking the customer for
 * the photographs again.
 */
export function productImageKey(
  productId: string,
  imageId: string,
  ext: string,
): string {
  const clean = ext.replace(/^\./, "").toLowerCase();
  return `products/${productId}/${imageId}.${clean}`;
}

/** `products/{productId}/{imageId}.1600.webp` — the one every screen reads. */
export function productThumbKey(productId: string, imageId: string): string {
  return `products/${productId}/${imageId}.1600.webp`;
}
