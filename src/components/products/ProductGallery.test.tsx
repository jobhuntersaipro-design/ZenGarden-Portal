import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductGallery } from "@/components/products/ProductGallery";

const render = (audience: "staff" | "buyer", images: { id: string; url: string | null; position: number }[]) =>
  renderToStaticMarkup(
    <ProductGallery images={images} productName="ZEN 2.1L — Lavender" canEdit={false} audience={audience} />,
  );

const none: { id: string; url: string | null; position: number }[] = [];
const missing = [{ id: "i1", url: null, position: 0 }];

describe("ProductGallery's empty state", () => {
  // A buyer cannot ask a super admin for anything, and should not be told to
  // (2026-09-24). Both empty states — no photo, and a photo that will not
  // load — read the same to them.
  it.each([
    ["no images", none],
    ["an image that will not load", missing],
  ])("tells a buyer nothing about staff for %s", (_label, images) => {
    const html = render("buyer", images);
    expect(html).toContain("Photo coming soon");
    expect(html).not.toMatch(/super admin/i);
  });

  it("keeps the staff wording in the portal", () => {
    expect(render("staff", none)).toContain("Ask a super admin to add one");
    expect(render("staff", missing)).toContain("The file could not be loaded — ask a super admin");
  });
});
