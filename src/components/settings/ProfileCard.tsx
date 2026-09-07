"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { updateProfile } from "@/actions/profile";
import {
  AvatarPicker,
  type StylePreview,
} from "@/components/settings/AvatarPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AvatarStyleId } from "@/lib/avatar-style-ids";
import { formatDate } from "@/lib/dates";

const LABEL = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

export function ProfileCard(props: {
  name: string;
  email: string;
  image: string | null;
  roleLabel: string;
  createdAt: string;
  seeds: string[];
  previews: StylePreview[];
  currentStyle: AvatarStyleId | null;
  currentSeed: string | null;
}) {
  const { update } = useSession();
  const router = useRouter();
  const [name, setName] = useState(props.name);
  const [pending, setPending] = useState(false);

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="mb-md font-display text-[length:var(--text-heading-sm)] text-ink">
        Profile
      </h2>

      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-xs">
          <span className={LABEL}>Picture</span>
          <AvatarPicker
            name={props.name}
            image={props.image}
            seeds={props.seeds}
            previews={props.previews}
            currentStyle={props.currentStyle}
            currentSeed={props.currentSeed}
          />
        </div>

        <form
          className="flex flex-col gap-md"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            const result = await updateProfile({ name });
            setPending(false);
            if (!result.success) {
              toast.error(result.error);
              return;
            }
            // update() rewrites the session cookie; refresh() is what makes
            // the server-rendered sidebar read it.
            await update();
            router.refresh();
            toast.success("Saved");
          }}
        >
          <label className="flex max-w-panel-sm flex-col gap-xs">
            <span className={LABEL}>Display name</span>
            <Input
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div className="flex flex-col gap-xxs">
            <span className={LABEL}>Email</span>
            <p className="text-[length:var(--text-body-md)] text-ink">
              {props.email}
            </p>
            <p className="text-[length:var(--text-caption)] text-ink-tertiary">
              Your email is how you sign in and how your admin finds you. Ask a
              super admin to change it.
            </p>
          </div>

          <div className="flex flex-wrap gap-xl">
            <div className="flex flex-col gap-xxs">
              <span className={LABEL}>Role</span>
              <p className="text-[length:var(--text-body-md)] text-ink">
                {props.roleLabel}
              </p>
            </div>
            <div className="flex flex-col gap-xxs">
              <span className={LABEL}>Member since</span>
              <p className="text-[length:var(--text-body-md)] text-ink">
                {formatDate(props.createdAt)}
              </p>
            </div>
          </div>

          <div>
            <Button type="submit" pending={pending}>
              Save
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
