import type { CSSProperties, ReactNode } from "react";

/**
 * Mail clients do not load our stylesheet, so the design tokens are written
 * out by hand here and in `Layout.tsx`. These two files are the only place in
 * the codebase where a raw hex value is expected.
 */
export const ink = "#292d34";
export const inkSecondary = "#646464";
export const inkTertiary = "#838383";
export const surfaceSoft = "#e9ebf0";

const bodyFont = "Inter, Helvetica, Arial, sans-serif";

export function Heading({ children }: { children: ReactNode }) {
  return (
    <h1
      style={{
        margin: "0 0 12px",
        fontFamily: "'Plus Jakarta Sans', Helvetica, Arial, sans-serif",
        fontSize: 26,
        lineHeight: 1.25,
        letterSpacing: "-0.91px",
        fontWeight: 650,
        color: ink,
      }}
    >
      {children}
    </h1>
  );
}

export function Paragraph({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <p
      style={{
        margin: "0 0 16px",
        fontFamily: bodyFont,
        fontSize: muted ? 12 : 16,
        lineHeight: muted ? 1.5 : 1.375,
        letterSpacing: muted ? "-0.12px" : "-0.32px",
        color: muted ? inkTertiary : inkSecondary,
      }}
    >
      {children}
    </p>
  );
}

/** The dark pill from the design system, rebuilt in table-safe inline CSS. */
export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      style={{
        display: "inline-block",
        margin: "8px 0 16px",
        padding: "14px 24px",
        borderRadius: 20,
        backgroundColor: ink,
        color: "#ffffff",
        fontFamily: bodyFont,
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: "-0.15px",
        textDecoration: "none",
      }}
    >
      {children}
    </a>
  );
}

/** For anything the reader has to copy exactly: links, temporary passwords. */
export function Mono({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: "'Sometype Mono', ui-monospace, Menlo, Consolas, monospace",
        fontSize: 14,
        color: ink,
        wordBreak: "break-all",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
