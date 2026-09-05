import {
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
 * Upload URL for the browser. Content-Type is pinned so the client cannot
 * upload something other than what it declared; size is enforced again on
 * /api/upload/complete via headObject.
 */
export function presignPut(key: string, contentType: string, maxBytes: number) {
  return getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: maxBytes,
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

/** `po/2026/09/{documentId}.pdf`, foldered by KL date so listings stay usable. */
export function documentKey(documentId: string, ext: string): string {
  const now = new TZDate(new Date(), TIME_ZONE);
  const clean = ext.replace(/^\./, "").toLowerCase();
  return `po/${format(now, "yyyy")}/${format(now, "MM")}/${documentId}.${clean}`;
}
