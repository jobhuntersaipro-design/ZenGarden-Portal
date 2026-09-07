"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * One flag, shared between `/settings` and the shell.
 *
 * The picture a person changes on `/settings` is also the picture in the
 * sidebar and the mobile top bar, and those live in the portal *layout* — a
 * different subtree from the page, re-rendered on the server. Until this
 * existed the preview span and the shell disagreed for the length of a save:
 * the preview said "working", the shell showed the old picture as if nothing
 * were happening, and the success toast arrived before either had changed.
 *
 * A context rather than a store: there is exactly one writer (the picker) and
 * one reader (`UserMenu`), and both are already inside the layout's tree.
 */
type AvatarSavingValue = {
  /** True from the click until the new picture is on screen everywhere. */
  saving: boolean;
  setSaving: (saving: boolean) => void;
};

const AvatarSavingContext = createContext<AvatarSavingValue | null>(null);

export function AvatarSavingProvider({ children }: { children: ReactNode }) {
  const [saving, setSaving] = useState(false);
  const value = useMemo(() => ({ saving, setSaving }), [saving]);
  return <AvatarSavingContext value={value}>{children}</AvatarSavingContext>;
}

/**
 * Outside the provider this is inert rather than an error: `UserMenu` renders
 * on the auth screens too, where no picture can be changed.
 */
export function useAvatarSaving(): AvatarSavingValue {
  return (
    useContext(AvatarSavingContext) ?? { saving: false, setSaving: () => {} }
  );
}
