import type { ReactNode } from "react";
import {
  BRAND_LOGO_CID,
  BRAND_LOGO_HEIGHT,
  BRAND_LOGO_WIDTH,
} from "@/lib/brand-logo";

/**
 * Shell for every transactional email. Inline styles only — mail clients do
 * not load our stylesheet, so the design tokens are written out by hand here.
 * This is the one place raw hex is expected.
 *
 * At most 600px wide with 32px of padding, so the content column is at most
 * 536px — the width a purchase order's preview image is drawn at
 * (`po-parts.tsx`) — and narrower on a phone.
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* eslint-disable-next-line @next/next/no-head-element -- an email, not a page */}
      <head>
        {/* Declared, not assumed: without it "·" and "—" can arrive as "Â·". */}
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style={{
          margin: 0,
          backgroundColor: "#f8f9fa",
          fontFamily: "Inter, Helvetica, Arial, sans-serif",
          color: "#292d34",
        }}
      >
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ padding: "32px 0" }}
        >
          <tbody>
            <tr>
              <td align="center">
                <table
                  role="presentation"
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{
                    // Full width capped at 600, not a fixed 600 held down by
                    // max-width: browsers ignore max-width on a table, so a
                    // fixed width never shrank on a phone.
                    width: "100%",
                    maxWidth: 600,
                    backgroundColor: "#ffffff",
                    borderRadius: 14,
                  }}
                >
                  <tbody>
                    <tr>
                      {/* Padding on the cell: Outlook ignores it on a table. */}
                      <td style={{ padding: 32 }}>
                        {/* The logo oval, attached inline by `sendEmail`. A
                            client that blocks images still reads the alt. */}
                        {/* eslint-disable-next-line @next/next/no-img-element -- an email, not a page */}
                        <img
                          src={`cid:${BRAND_LOGO_CID}`}
                          width={Math.round(BRAND_LOGO_WIDTH / 2)}
                          height={Math.round(BRAND_LOGO_HEIGHT / 2)}
                          alt="Zen Garden"
                          // React's server renderer hoists a <link rel="preload">
                          // into <head> for any <img> it sees; "low" stops it,
                          // as on the purchase-order preview (po-parts.tsx).
                          fetchPriority="low"
                          style={{
                            display: "block",
                            border: 0,
                            fontFamily:
                              "'Plus Jakarta Sans', Helvetica, Arial, sans-serif",
                            fontSize: 22,
                            fontWeight: 700,
                            color: "#292d34",
                          }}
                        />
                        <div
                          style={{
                            height: 1,
                            backgroundColor: "#e8e8e8",
                            margin: "20px 0 24px",
                          }}
                        />
                        {children}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export default Layout;
