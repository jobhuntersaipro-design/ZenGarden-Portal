"use client";

import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Lock } from "lucide-react";
import { Role } from "@/generated/prisma/enums";
import {
  updatePermissions,
  type PermissionChange,
} from "@/actions/permissions";
import { Button } from "@/components/ui/button";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { useEdgeFades } from "@/hooks/useEdgeFades";
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

/**
 * The Administration rows are locked: the grid shows them, and a save cannot
 * grant them. They start folded so the rows a save *can* change are the ones
 * on screen. Every other group stays open.
 */
export const COLLAPSED_GROUP = "Administration";

export function groupStartsCollapsed(group: string): boolean {
  return group === COLLAPSED_GROUP;
}

/**
 * `null` is every role column. A role is that column alone — the action
 * names stay, which is the context the column was being read against.
 */
export function visibleOpsRoles(focus: OpsRole | null): readonly OpsRole[] {
  return focus === null ? OPS_ROLES : [focus];
}

/** The corner cell: it has to beat both the header row and the action column. */
export const STICKY_CORNER =
  "sticky top-0 left-0 z-30 border-r border-hairline bg-canvas";
/** Role names. Above the body, including a sticky action cell scrolling up. */
export const STICKY_HEAD = "sticky top-0 z-20 bg-canvas";
/**
 * Permission names. Above the role cells scrolling sideways. The hairline is
 * the edge those cells disappear behind — without it a header reads as cut
 * off mid-word.
 */
export const STICKY_ACTION =
  "sticky left-0 z-10 border-r border-hairline bg-canvas";

const isFixed = (role: OpsRole, action: PermissionAction) =>
  role === Role.SUPER_ADMIN || Boolean(action.locked);

/** The rows of one group, in registry order. */
const rowsIn = (group: string) =>
  PERMISSION_ACTIONS.filter((action) => action.group === group);

const segmentClass = (pressed: boolean) =>
  `h-control-md shrink-0 px-md text-[length:var(--text-caption)] -outline-offset-2 ${
    pressed
      ? "bg-surface-soft font-semibold text-ink"
      : "text-ink-secondary hover:text-ink"
  }`;

/**
 * Who may do what — Phase 48.
 *
 * Saving is explicit rather than per-toggle: a hundred cells autosaving would
 * be a hundred round trips with no undo. The dirty set is derived by comparing
 * against the server's matrix, so toggling a cell back to where it started
 * removes it from the save rather than writing it again.
 *
 * The matrix scrolls inside the card. `overflow-x` on a wrapper computes
 * `overflow-y` to `auto` as well, so a header stuck to the *page* never
 * engages — the scroller is the only ancestor a sticky cell can anchor to.
 * `border-separate` is what lets that stick: a collapsed border belongs to
 * the row, and a sticky cell painted over it loses the rule that says it is
 * still part of the table.
 */
export function PermissionGrid({
  matrix,
  initialRoleFocus = null,
  initialAdminOpen = !groupStartsCollapsed(COLLAPSED_GROUP),
}: {
  matrix: PermissionMatrix;
  /** Starting desktop column. `null` is every role. The phone picker is separate. */
  initialRoleFocus?: OpsRole | null;
  /** Administration starts closed. Tests open it without a click. */
  initialAdminOpen?: boolean;
}) {
  const refresh = useAwaitableRefresh();
  const [draft, setDraft] = useState<PermissionMatrix>(matrix);
  const [saving, setSaving] = useState(false);
  // The phone cannot show five columns at 44px, so it shows one role at a time.
  const [phoneRole, setPhoneRole] = useState<OpsRole>(Role.PRODUCTION_PLANNER);
  // Desktop can show every column, or one — the action names stay either way.
  const [roleFocus, setRoleFocus] = useState<OpsRole | null>(initialRoleFocus);
  const [adminOpen, setAdminOpen] = useState(initialAdminOpen);
  const desktopRoles = visibleOpsRoles(roleFocus);
  // Right edge only. A fade on the left would cover the sticky action names,
  // which are the thing that edge is for.
  const { ref: scrollerRef, clipped, measure } = useEdgeFades<HTMLDivElement>();

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

  const phoneRow = (action: PermissionAction) => (
    <li
      key={action.key}
      className="flex items-start justify-between gap-md border-t border-hairline py-sm"
    >
      <span className="min-w-0">{rowLabel(action)}</span>
      <span className="flex size-11 shrink-0 items-center justify-center">
        {cell(phoneRole, action)}
      </span>
    </li>
  );

  return (
    <section className="mt-xl min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <p className={eyebrow}>Access</p>
      <h2 className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
        Permissions
      </h2>
      <p className={`mt-xxs ${caption}`}>
        What each role may do. Changes take effect on the next page load — no
        deploy. A super admin always has everything, and everything under Admin
        is super admin only.
      </p>

      {/* Desktop: every role, or one. The action column is the context either way. */}
      <div className="mt-md hidden min-w-0 md:block">
        <SegmentGroup label="Role">
          <button
            type="button"
            onClick={() => setRoleFocus(null)}
            aria-pressed={roleFocus === null}
            className={segmentClass(roleFocus === null)}
          >
            All
          </button>
          {OPS_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setRoleFocus(role)}
              aria-pressed={role === roleFocus}
              className={segmentClass(role === roleFocus)}
            >
              {roleLabel(role)}
            </button>
          ))}
        </SegmentGroup>
        <div className="relative mt-sm">
          <div
            ref={scrollerRef}
            onScroll={measure}
            className="max-h-permission-grid max-w-full overflow-auto"
          >
          <table className="w-max min-w-full border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th
                  scope="col"
                  className={`${STICKY_CORNER} min-w-72 border-b border-hairline pb-xs text-left ${eyebrow}`}
                >
                  Action
                </th>
                {desktopRoles.map((role) => (
                  <th
                    key={role}
                    scope="col"
                    className={`${STICKY_HEAD} w-px border-b border-hairline px-sm pb-xs text-center whitespace-nowrap ${eyebrow}`}
                  >
                    {roleLabel(role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((group) => {
                const open = group !== COLLAPSED_GROUP || adminOpen;
                return (
                  <Fragment key={group}>
                    <tr>
                      <th
                        scope="rowgroup"
                        className={`${STICKY_ACTION} border-t border-hairline pt-sm pb-xxs ${
                          group === COLLAPSED_GROUP ? "" : eyebrow
                        }`}
                      >
                        {group === COLLAPSED_GROUP ? (
                          <AdminGroupToggle
                            open={adminOpen}
                            onToggle={() => setAdminOpen((value) => !value)}
                          />
                        ) : (
                          group
                        )}
                      </th>
                      {desktopRoles.map((role) => (
                        <td key={role} className="border-t border-hairline" />
                      ))}
                    </tr>
                    {open
                      ? rowsIn(group).map((action) => (
                          <tr key={action.key} className="align-top">
                            <td className={`${STICKY_ACTION} min-w-72 py-xs pr-md`}>
                              {rowLabel(action)}
                            </td>
                            {desktopRoles.map((role) => (
                              <td key={role} className="py-xs text-center">
                                {cell(role, action)}
                              </td>
                            ))}
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
          {clipped.right ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-xl bg-linear-to-l from-canvas to-transparent"
            />
          ) : null}
        </div>
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
              className={segmentClass(role === phoneRole)}
            >
              {roleLabel(role)}
            </button>
          ))}
        </SegmentGroup>
        <ul className="mt-md flex flex-col">
          {PERMISSION_ACTIONS.filter((action) => action.group !== COLLAPSED_GROUP).map(
            phoneRow,
          )}
        </ul>
        <div className="border-t border-hairline">
          <AdminGroupToggle
            open={adminOpen}
            onToggle={() => setAdminOpen((value) => !value)}
            className="min-h-control-md"
          />
        </div>
        {adminOpen ? (
          <ul className="flex flex-col">{rowsIn(COLLAPSED_GROUP).map(phoneRow)}</ul>
        ) : null}
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

function AdminGroupToggle({
  open,
  onToggle,
  className = "",
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      title={LOCKED_TITLE}
      className={`flex w-full items-center gap-xxs rounded-xxs text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${eyebrow} ${className}`}
    >
      <ChevronRight
        className={`size-3 shrink-0 transition-transform motion-reduce:transition-none ${
          open ? "rotate-90" : ""
        }`}
        aria-hidden
      />
      Administration
      <Lock className="size-3 shrink-0" aria-hidden />
    </button>
  );
}
