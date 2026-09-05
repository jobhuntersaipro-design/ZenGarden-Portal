import type { ReactNode } from "react";

/**
 * Shell for every transactional email. Inline styles only — mail clients do
 * not load our stylesheet, so the design tokens are written out by hand here.
 * This is the one place raw hex is expected.
 */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
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
                  width="560"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{
                    width: 560,
                    maxWidth: "100%",
                    backgroundColor: "#ffffff",
                    borderRadius: 14,
                    padding: 32,
                  }}
                >
                  <tbody>
                    <tr>
                      <td>
                        <div
                          style={{
                            fontFamily:
                              "'Plus Jakarta Sans', Helvetica, Arial, sans-serif",
                            fontSize: 22,
                            fontWeight: 700,
                            letterSpacing: "-0.88px",
                            color: "#292d34",
                          }}
                        >
                          <span style={{ color: "#7612fa" }}>Loving</span> Hands
                        </div>
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
