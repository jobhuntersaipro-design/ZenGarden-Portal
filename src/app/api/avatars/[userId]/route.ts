import { GetObjectCommand } from "@aws-sdk/client-s3";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { r2 } from "@/lib/r2";

/**
 * The portal has no anonymous surface, so avatars are not public either.
 *
 * `immutable` is safe only because the URL carries `?v={hash}` of the stored
 * bytes: a changed picture becomes a different URL, so nothing stale can be
 * served. `private` keeps shared caches out of it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await requireUser();
  } catch (cause) {
    if (cause instanceof UnauthorizedError) {
      return new Response("Not signed in.", { status: 401 });
    }
    throw cause;
  }

  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarKey: true },
  });
  if (!user?.avatarKey) return new Response("Not found.", { status: 404 });

  // Uint8Array<ArrayBuffer>, not <ArrayBufferLike>: BodyInit will not take a view
  // that might be backed by a SharedArrayBuffer.
  let body: Uint8Array<ArrayBuffer>;
  try {
    const object = await r2.send(
      new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: user.avatarKey }),
    );
    if (!object.Body) return new Response("Not found.", { status: 404 });
    body = new Uint8Array(await object.Body.transformToByteArray());
  } catch {
    // A missing object is the initials fallback's cue, not a server fault.
    return new Response("Not found.", { status: 404 });
  }

  return new Response(body, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
