"use client";

import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Role } from "@/generated/prisma/enums";
import {
  updatePermissions,
  type PermissionChange,
} from "@/actions/permissions";
import { Button } from "@/components/ui/button";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import {
  PERMISSION_ACTIONS,
  PERMISSION_GROUPS,
  type PermissionAction,
  type PermissionKey,
} from "@/lib/permissions/actions";
import { OPS_ROLES, roleLabel, type OpsRole } from "@/lib/permissions/roles";
import { cellKey, type PermissionMatrix } from "@/lib/permissions/matrix";

const caption = "text-[length:var(--text-caption)] text-ink-tertiary";
const eyebrow = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

const LOCKED_TITLE = "Everything under Admin is super admin only.";
const SUPER_ADMIN_TITLE =
  "A super admin always has every permission, so they cannot lock themselves out.";

const isFixed = (role: OpsRole, action: PermissionAction) =>
  role === Role.SUPER_ADMIN || Boolean(action.locked);

/** The rows of one group, in registry order. */
const rowsIn = (group: string) =>
  PERMISSION_ACTIONS.filter((action) => action.group === group);

/**
 * Who may do what — Phase 48.
 *
 * Saving is explicit rather than per-toggle: a hundred cells autosaving would
 * be a hundred round trips with no undo. The dirty set is derived by comparing
 * against the server's matrix, so toggling a cell back to where it started
 * removes it from the save rather than writing it again.
 */
export function PermissionGrid({ matrix }: { matrix: PermissionMatrix }) {
  const refresh = useAwaitableRefresh();
  const [draft, setDraft] = useState<PermissionMatrix>(matrix);
  const [saving, setSaving] = useState(false);
  // The phone cannot show five columns at 44px, so it shows one role at a time.
  const [phoneRole, setPhoneRole] = useState<OpsRole>(Role.PRODUCTION_PLANNER);

  const changes = useMemo<PermissionChange[]>(
    () =>
      OPS_ROLES.flatMap((role) =>
        PERMISSION_ACTIONS.filter(
          (action) =>
            !isFixed(role, action) &&
            draft[cellKey(role, action.key)] !== matrix[cellKey(role, action.key)],
        ).map((action) => ({
          role,
          action: action.key as PermissionKey,
          granted: draft[cellKey(role, action.key)],
        })),
      ),
    [draft, matrix],
  );

  const toggle = (role: OpsRole, action: PermissionAction) => {
    if (isFixed(role, action)) return;
    const key = cellKey(role, action.key);
    setDraft((current) => ({ ...current, [key]: !current[key] }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await updatePermissions(changes);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data.changed === 1
          ? "1 permission updated."
          : `${result.data.changed} permissions updated.`,
      );
      await refresh();
    } catch {
      // An unguarded await here is what left the avatar picker permanently
      // disabled on 2026-09-08.
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const cell = (role: OpsRole, action: PermissionAction) => {
    const fixed = isFixed(role, action);
    const key = cellKey(role, action.key);
    return (
      <input
        type="checkbox"
        checked={draft[key] ?? false}
        disabled={fixed}
        onChange={() => toggle(role, action)}
        aria-label={`${roleLabel(role)}: ${action.label}`}
        title={
          role === Role.SUPER_ADMIN
            ? SUPER_ADMIN_TITLE
            : action.locked
              ? LOCKED_TITLE
              : undefined
        }
        className="size-5 accent-ink disabled:cursor-not-allowed disabled:opacity-40"
      />
    );
  };

  const rowLabel = (action: PermissionAction) => (
    <>
      <span className="flex items-center gap-xxs text-[length:var(--text-body-sm)] text-ink">
        {action.label}
        {action.locked ? (
          <Lock className="size-3 shrink-0 text-ink-tertiary" aria-hidden />
        ) : null}
      </span>
      <span className={`mt-xxs block ${caption}`}>{action.description}</span>
    </>
  );

  return (
    <section className="mt-xl rounded-lg border border-hairline bg-canvas p-lg">
      <p className={eyebrow}>Access</p>
      <h2 className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
        Permissions
      </h2>
      <p className={`mt-xxs ${caption}`}>
        What each role may do. Changes take effect on the next page load — no
        deploy. A super admin always has everything, and everything under Admin
        is super admin only.
      </p>

      {/* Desktop: the whole grid. */}
      <div className="mt-md hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className={`w-1/2 pb-xs ${eyebrow}`}>Action</th>
              {OPS_ROLES.map((role) => (
                <th key={role} className={`pb-xs text-center ${eyebrow}`}>
                  {roleLabel(role)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((group) => (
              <Fragment key={group}>
                <tr>
                  <th
                    colSpan={OPS_ROLES.length + 1}
                    className={`border-t border-hairline pt-sm pb-xxs ${eyebrow}`}
                  >
                    {group}
                  </th>
                </tr>
                {rowsIn(group).map((action) => (
                  <tr key={action.key} className="align-top">
                    <td className="py-xs pr-md">{rowLabel(action)}</td>
                    {OPS_ROLES.map((role) => (
                      <td key={role} className="py-xs text-center">
                        {cell(role, action)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: one role at a time — five 44px columns do not fit at 390. */}
      <div className="mt-md md:hidden">
        <SegmentGroup label="Role" hideLabel>
          {OPS_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setPhoneRole(role)}
              aria-pressed={role === phoneRole}
              // The `segment` geometry from ChoiceButton, which is URL-driven
              // and so cannot serve a picker that only moves local state.
              className={`h-control-md shrink-0 px-md text-[length:var(--text-caption)] -outline-offset-2 ${
                role === phoneRole
                  ? "bg-surface-soft font-semibold text-ink"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              {roleLabel(role)}
            </button>
          ))}
        </SegmentGroup>
        <ul className="mt-md flex flex-col">
          {PERMISSION_ACTIONS.map((action) => (
            <li
              key={action.key}
              className="flex items-start justify-between gap-md border-t border-hairline py-sm"
            >
              <span className="min-w-0">{rowLabel(action)}</span>
              <span className="flex size-11 shrink-0 items-center justify-center">
                {cell(phoneRole, action)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-lg flex items-center gap-sm">
        <Button onClick={() => void save()} pending={saving} disabled={changes.length === 0}>
          {saving
            ? "Saving…"
            : changes.length === 0
              ? "Save changes"
              : changes.length === 1
                ? "Save 1 change"
                : `Save ${changes.length} changes`}
        </Button>
        {changes.length > 0 ? (
          <button
            type="button"
            onClick={() => setDraft(matrix)}
            className={`${caption} underline underline-offset-2`}
          >
            Discard
          </button>
        ) : null}
      </div>
    </section>
  );
}
