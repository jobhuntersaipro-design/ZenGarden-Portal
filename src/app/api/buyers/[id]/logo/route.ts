import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { LogoError, removeBuyerLogo, storeBuyerLogo } from "@/lib/buyer-logo-store";
import { guardRoute as guard } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { getObjectBytes } from "@/lib/r2";
import { logoRejectionReason } from "@/lib/validation/buyer-files";

export type BuyerLogoUploadResponse = { url: string };

/**
 * A buyer's company logo (2026-09-24). A route rather than a Server Action
 * for the avatar's reason: Server Actions cap a body at 1 MB, and a logo
 * exported from a design tool is often larger before it is fitted.
 */
const revalidate = (buyerId: string) => {
  revalidatePath(`/buyers/${buyerId}`);
  revalidatePath(`/admin/buyers/${buyerId}`);
};

/** Staff only, like every avatar: the portal has no anonymous surface. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { denied } = await guard("buyer.view");
  if (denied) return new Response("Not allowed.", { status: denied.status });

  const { id } = await params;
  const buyer = await prisma.buyer.findUnique({
    where: { id },
    select: { logoKey: true },
  });
  if (!buyer?.logoKey) return new Response("Not found.", { status: 404 });

  let body: Uint8Array<ArrayBuffer>;
  try {
    body = new Uint8Array(await getObjectBytes(buyer.logoKey));
  } catch {
    return new Response("Not found.", { status: 404 });
  }
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(body.byteLength),
      // Safe only because the URL carries `?v={hash}` of the stored bytes.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, denied } = await guard("buyer.manage");
  if (denied) return denied;
  const { id } = await params;

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
  const rejection = logoRejectionReason({ type: file.type, size: file.size });
  if (rejection) return NextResponse.json({ error: rejection }, { status: 400 });

  try {
    const { url } = await storeBuyerLogo({
      buyerId: id,
      actorId: user.id,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    revalidate(id);
    return NextResponse.json({ url } satisfies BuyerLogoUploadResponse);
  } catch (cause) {
    if (cause instanceof LogoError) {
      return NextResponse.json({ error: cause.message }, { status: 400 });
    }
    console.error("[buyer-logo] upload", cause);
    return NextResponse.json({ error: "We couldn't save that logo." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, denied } = await guard("buyer.manage");
  if (denied) return denied;
  const { id } = await params;
  try {
    await removeBuyerLogo({ buyerId: id, actorId: user.id });
    revalidate(id);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    if (cause instanceof LogoError) {
      return NextResponse.json({ error: cause.message }, { status: 404 });
    }
    console.error("[buyer-logo] remove", cause);
    return NextResponse.json({ error: "We couldn't remove that logo." }, { status: 500 });
  }
}
