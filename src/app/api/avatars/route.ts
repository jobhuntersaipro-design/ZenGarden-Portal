import { NextResponse } from "next/server";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { AvatarError, storeAvatar } from "@/lib/avatar-store";
import { avatarRejectionReason } from "@/lib/validation/profile";

export type AvatarUploadResponse = { url: string };

/**
 * A route handler rather than a Server Action: Server Actions cap request
 * bodies at 1 MB by default, and a phone photo exceeds that before it is
 * resized. `context/coding-standard.md` prescribes a route for file uploads.
 *
 * Errors come back as a sentence the form shows verbatim, matching the upload
 * queue's plain-language style.
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No picture was sent." }, { status: 400 });
  }

  const rejection = avatarRejectionReason({ type: file.type, size: file.size });
  if (rejection) {
    return NextResponse.json({ error: rejection }, { status: 400 });
  }

  try {
    const { url } = await storeAvatar({
      userId: user.id,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json({ url } satisfies AvatarUploadResponse);
  } catch (cause) {
    if (cause instanceof AvatarError) {
      return NextResponse.json({ error: cause.message }, { status: 400 });
    }
    console.error("[avatar] upload", cause);
    return NextResponse.json(
      { error: "We couldn't save that picture." },
      { status: 500 },
    );
  }
}
