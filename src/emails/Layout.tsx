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
/**
 * A second logo beside ours (2026-09-24): the buyer's, on every email about
 * their order, so a reader knows at a glance whose order it is. Attached
 * inline by `preparePoEmail` under `cid`; sized there from the stored width
 * and height, since Outlook needs both attributes.
 */
export type PartnerLogo = { cid: string; width: number; height: number; alt: string };

export function Layout({
  children,
  partnerLogo,
}: {
  children: ReactNode;
  partnerLogo?: PartnerLogo | null;
}) {
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
                        {/* Our badge and, on an order email, the buyer's
                            logo beside it. A table, not flex: mail clients
                            do not lay out flex. */}
                        <table role="presentation" cellPadding={0} cellSpacing={0}>
                          <tbody>
                            <tr>
                              <td style={{ verticalAlign: "middle" }}>
                        {/* The flower badge, attached inline by `sendEmail`. A
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
                              </td>
                              {partnerLogo ? (
                                <>
                                  <td
                                    style={{
                                      verticalAlign: "middle",
                                      padding: "0 16px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: 1,
                                        height: 40,
                                        backgroundColor: "#e8e8e8",
                                      }}
                                    />
                                  </td>
                                  <td style={{ verticalAlign: "middle" }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- an email, not a page */}
                                    <img
                                      src={`cid:${partnerLogo.cid}`}
                                      width={partnerLogo.width}
                                      height={partnerLogo.height}
                                      alt={partnerLogo.alt}
                                      fetchPriority="low"
                                      style={{
                                        display: "block",
                                        border: 0,
                                        fontFamily: "Inter, Helvetica, Arial, sans-serif",
                                        fontSize: 16,
                                        fontWeight: 600,
                                        color: "#292d34",
                                      }}
                                    />
                                  </td>
                                </>
                              ) : null}
                            </tr>
                          </tbody>
                        </table>
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
