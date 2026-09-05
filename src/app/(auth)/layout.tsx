import type { ReactNode } from "react";

/** Every auth screen is one card centred on the `surface` canvas. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-md">
      {children}
    </div>
  );
}
