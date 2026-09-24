import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Notice } from "@/components/auth/Notice";

// A dismissed strip unmounts rather than persisting a flag, so the at-rest
// render is the whole of what a static render can see (`context/lessons.md`
// §3). What it can see is whether there is a way out at all — which is the
// defect: the auth strips had none.
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("Notice", () => {
  it("offers an ✕ when a form can clear its own error", () => {
    const markup = html(
      <Notice onDismiss={vi.fn()}>Wrong email or password.</Notice>,
    );
    expect(markup).toContain('aria-label="Dismiss this message"');
    expect(markup).toContain("<button");
  });

  it("offers an ✕ that drops the parameter when the message came from the URL", () => {
    const markup = html(
      <Notice dismissHref="/signin?next=%2Fbuyers">
        Wrong email or password.
      </Notice>,
    );
    expect(markup).toContain('aria-label="Dismiss this message"');
    // A link, not a button: the cause is in the URL, so the ✕ has to navigate.
    expect(markup).toContain('href="/signin?next=%2Fbuyers"');
  });

  it("offers no ✕ when nothing would be dismissed", () => {
    // The forgot-password screen's success strip *is* the answer to what the
    // reader just did. Closing it would leave the page saying nothing.
    const markup = html(
      <Notice tone="success">
        If that address has a password, we&rsquo;ve emailed a link.
      </Notice>,
    );
    expect(markup).not.toContain("Dismiss this message");
  });

  it("writes the words in ink, not in the accent", () => {
    // Measured on `surface-soft`: accent-red 3.32:1 and accent-green 3.61:1,
    // both under the 4.5:1 floor for normal text; ink is 11.59:1. The tone is
    // carried by the icon and the border instead, which have only 3:1 to
    // clear. Watched failing against `text-accent-red`.
    const markup = html(
      <Notice onDismiss={vi.fn()}>Wrong email or password.</Notice>,
    );
    expect(markup).toContain("text-ink");
    expect(markup).not.toContain("text-accent-red bg-surface-soft");
    expect(markup).not.toMatch(
      /class="[^"]*\btext-accent-red\b[^"]*"[^>]*>Wrong/,
    );
  });

  it("marks the tone on the border and an icon, one per tone", () => {
    expect(html(<Notice>Bad</Notice>)).toContain("border-accent-red");
    expect(html(<Notice tone="success">Good</Notice>)).toContain(
      "border-accent-green",
    );
    // An icon rather than colour alone, so the tone survives a reader who
    // cannot tell the two hues apart.
    expect(html(<Notice>Bad</Notice>)).toContain("<svg");
  });

  it("keeps the error strip an alert and the others a status", () => {
    expect(html(<Notice>Bad</Notice>)).toContain('role="alert"');
    expect(html(<Notice tone="success">Good</Notice>)).toContain(
      'role="status"',
    );
  });

  it("gives the ✕ a 44px target on a phone", () => {
    // The floor this project does not negotiate. `size-11` is 44px; it drops
    // to `sm:size-7` where there is a pointer.
    expect(html(<Notice onDismiss={vi.fn()}>Bad</Notice>)).toContain("size-11");
  });
});
