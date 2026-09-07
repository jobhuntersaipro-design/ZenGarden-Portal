import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import type { Metadata, Sharp } from "sharp";
import { avatarObjectKey, avatarUrl, contentHash } from "@/lib/avatar";
import { type AvatarStyleId, renderAvatarSvg } from "@/lib/avatar-styles";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { deleteObject, r2 } from "@/lib/r2";
import {
  AVATAR_MAX_DIMENSION,
  AVATAR_TOO_BIG_DIMENSIONS,
  AVATAR_WRONG_TYPE,
} from "@/lib/validation/profile";

/** Its message is written for the user and is shown verbatim. */
export class AvatarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvatarError";
  }
}

/**
 * One size, no 2×: the largest render is the 96px profile preview, and 256
 * covers that on a 2× display.
 */
const AVATAR_SIZE = 256;

/**
 * The declared Content-Type only proves what the client claimed; this is where
 * we find out what actually arrived. A file sharp cannot open is not an image,
 * whatever its header said.
 */
async function toWebp(bytes: Uint8Array): Promise<Uint8Array> {
  let image: Sharp;
  let meta: Metadata;
  try {
    image = sharp(Buffer.from(bytes));
    meta = await image.metadata();
  } catch {
    throw new AvatarError(AVATAR_WRONG_TYPE);
  }

  const { width = 0, height = 0 } = meta;
  if (width > AVATAR_MAX_DIMENSION || height > AVATAR_MAX_DIMENSION) {
    throw new AvatarError(AVATAR_TOO_BIG_DIMENSIONS(width, height));
  }

  const out = await image
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
  return new Uint8Array(out);
}

async function put(key: string, bytes: Uint8Array): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: "image/webp",
    }),
  );
}

/**
 * Writes the row first, then deletes the object the row no longer points at.
 * A failed delete is logged rather than surfaced: an orphaned 256px WebP is
 * cheaper than telling the user a save failed when it did not.
 */
async function commit(input: {
  userId: string;
  key: string;
  url: string;
  style: AvatarStyleId | null;
  seed: string | null;
}): Promise<void> {
  const previous = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { avatarKey: true },
  });

  await prisma.user.update({
    where: { id: input.userId },
    data: {
      avatarKey: input.key,
      image: input.url,
      avatarStyle: input.style,
      avatarSeed: input.seed,
    },
  });

  if (previous?.avatarKey && previous.avatarKey !== input.key) {
    try {
      await deleteObject(previous.avatarKey);
    } catch (cause) {
      console.error("[avatar] could not delete the replaced object", cause);
    }
  }
}

async function store(input: {
  userId: string;
  bytes: Uint8Array;
  style: AvatarStyleId | null;
  seed: string | null;
}): Promise<{ url: string }> {
  const webp = await toWebp(input.bytes);
  const hash = contentHash(webp);
  const key = avatarObjectKey(input.userId, hash);
  const url = avatarUrl(input.userId, hash);
  await put(key, webp);
  await commit({
    userId: input.userId,
    key,
    url,
    style: input.style,
    seed: input.seed,
  });
  return { url };
}

/** An uploaded photo. `style`/`seed` stay null, which is what marks it a photo. */
export function storeAvatar(input: {
  userId: string;
  bytes: Uint8Array;
}): Promise<{ url: string }> {
  return store({ ...input, style: null, seed: null });
}

/** A generated avatar. Same bytes, same key shape — only the row differs. */
export function storeGeneratedAvatar(input: {
  userId: string;
  style: AvatarStyleId;
  seed: string;
}): Promise<{ url: string }> {
  const svg = renderAvatarSvg(input.style, input.seed, AVATAR_SIZE);
  return store({
    userId: input.userId,
    bytes: new TextEncoder().encode(svg),
    style: input.style,
    seed: input.seed,
  });
}

/**
 * Drops the stored picture. `nextImage` is null for "Remove" — which falls
 * back to initials, never silently to a Google photo — and a URL for
 * "Use my Google photo".
 */
export async function clearAvatar(
  userId: string,
  nextImage: string | null,
): Promise<void> {
  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarKey: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      avatarKey: null,
      avatarStyle: null,
      avatarSeed: null,
      image: nextImage,
    },
  });

  if (previous?.avatarKey) {
    try {
      await deleteObject(previous.avatarKey);
    } catch (cause) {
      console.error("[avatar] could not delete the removed object", cause);
    }
  }
}
