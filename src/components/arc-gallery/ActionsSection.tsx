"use client";

import { useState } from "react";
import {
  ArrowLeft,
  FolderInput,
  MessageSquarePlus,
  Settings,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { ActionButton } from "@/components/arc/action-button/action-button";
import { SplitButton } from "@/components/arc/split-button/split-button";
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { ConfirmMorph } from "@/components/arc/confirm-morph/confirm-morph";
import {
  SwipeActions,
  SwipeActionsRow,
} from "@/components/arc/swipe-actions/swipe-actions";
import { UserMenu } from "@/components/arc/user-menu/user-menu";
import { formatMYR } from "@/lib/money";
import { GalleryGroup, Specimen } from "./Specimen";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const STAGES = [
  "Order placed",
  "In production",
  "QC passed",
  "In warehouse",
  "Delivering",
  "Delivered",
] as const;

interface CartLine {
  id: string;
  product: string;
  buyer: string;
  cartons: number;
  amount: string;
}

const CART_LINES: CartLine[] = [
  { id: "l1", product: "ZEN 2.1L — Goat's Milk", buyer: "Acme Industrial Sdn Bhd", cartons: 12, amount: "2646" },
  { id: "l2", product: "MR.KING 1.5L — Lemon", buyer: "Meridian Chemicals", cartons: 4, amount: "630" },
  { id: "l3", product: "ZEN 1L — Lavender", buyer: "Kelana Steel", cartons: 6, amount: "1260" },
];

/** A caption under a part that says what the last press did. */
function Outcome({ children }: { children: string }) {
  return (
    <p
      aria-live="polite"
      className="text-[length:var(--text-caption)] text-ink-tertiary"
    >
      {children}
    </p>
  );
}

function ButtonSpecimen() {
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-sm">
        <Button variant="primary">Confirm order</Button>
        <Button variant="secondary">Edit</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger">Delete</Button>
      </div>
      <div className="flex flex-wrap items-center gap-sm">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </div>
      <div className="flex flex-wrap items-center gap-sm">
        <Button loading>Saving</Button>
        <Button disabled>Receive order</Button>
      </div>
    </div>
  );
}

function ActionButtonSpecimen() {
  const [saves, setSaves] = useState(0);
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-sm">
        <ActionButton
          label="Save details"
          pendingLabel="Saving"
          successLabel="Saved"
          onAction={async () => {
            await wait(900);
            setSaves((n) => n + 1);
          }}
        />
        <ActionButton
          label="Confirm order"
          pendingLabel="Confirming"
          successLabel="Confirmed"
          onAction={() => wait(1200)}
        />
      </div>
      <Outcome>{`Saved ${saves} ${saves === 1 ? "time" : "times"}`}</Outcome>
    </div>
  );
}

function SplitButtonSpecimen() {
  const [stage, setStage] = useState(1);
  const [notes, setNotes] = useState(0);
  const next = STAGES[Math.min(stage + 1, STAGES.length - 1)];
  const done = stage >= STAGES.length - 1;
  return (
    <div className="flex flex-col gap-sm">
      <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
        PO-2026-0039 · {STAGES[stage]}
      </p>
      <div className="flex flex-wrap items-center gap-sm">
        <SplitButton
          label={done ? "Delivered" : `Advance to ${next}`}
          disabled={done}
          onClick={() => setStage((s) => Math.min(s + 1, STAGES.length - 1))}
          actions={[
            {
              label: "Move back",
              icon: <ArrowLeft size={15} />,
              disabled: stage === 0,
              onSelect: () => setStage((s) => Math.max(s - 1, 0)),
            },
            {
              label: "Add a note",
              icon: <MessageSquarePlus size={15} />,
              onSelect: () => setNotes((n) => n + 1),
            },
          ]}
        />
        <SplitButton
          variant="secondary"
          label="Reset"
          onClick={() => {
            setStage(1);
            setNotes(0);
          }}
          actions={[{ label: "Back to Order placed", onSelect: () => setStage(0) }]}
        />
      </div>
      <Outcome>{`${notes} ${notes === 1 ? "note" : "notes"} added`}</Outcome>
    </div>
  );
}

function DropdownMenuSpecimen() {
  const [last, setLast] = useState("Nothing chosen yet");
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-sm">
        <DropdownMenu
          label="Price list Q4.xlsx"
          items={[
            { label: "Move to Contracts", icon: <FolderInput size={15} />, onSelect: () => setLast("Moved to Contracts") },
            { label: "Move to SSM", icon: <FolderInput size={15} />, onSelect: () => setLast("Moved to SSM") },
            { label: "Delete", icon: <Trash2 size={15} />, destructive: true, separatorBefore: true, onSelect: () => setLast("Deleted") },
          ]}
        />
        <DropdownMenu
          label="More"
          items={[
            { label: "Export CSV", onSelect: () => setLast("Exported CSV") },
            { label: "Print or save as PDF", disabled: true },
          ]}
        />
      </div>
      <Outcome>{last}</Outcome>
    </div>
  );
}

function CopyButtonSpecimen() {
  return (
    <dl className="grid grid-cols-1 gap-sm text-[length:var(--text-body-sm)]">
      <div className="flex min-w-0 flex-wrap items-center gap-sm">
        <dt className="text-ink-secondary">PO number</dt>
        <dd className="font-mono text-ink">PO-2026-0039</dd>
        <dd>
          <CopyButton value="PO-2026-0039" label="Copy PO number" iconOnly />
        </dd>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-sm">
        <dt className="text-ink-secondary">Order ID</dt>
        <dd className="font-mono text-ink">W-2609-00014</dd>
        <dd>
          <CopyButton value="W-2609-00014" label="Copy" />
        </dd>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-sm">
        <dt className="text-ink-secondary">Total</dt>
        <dd className="text-ink">{formatMYR("1234.5")}</dd>
        <dd>
          <CopyButton value={formatMYR("1234.5")} label="Copy total" variant="plain" iconOnly />
        </dd>
      </div>
    </dl>
  );
}

function ConfirmMorphSpecimen() {
  const [documents, setDocuments] = useState(3);
  const [cartLines, setCartLines] = useState(2);
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-sm">
        <ConfirmMorph
          label="Delete"
          icon={<Trash2 size={15} />}
          prompt="Delete Price list Q4.xlsx?"
          pendingLabel="Deleting"
          doneLabel="Deleted"
          onConfirm={async () => {
            await wait(900);
            setDocuments((n) => Math.max(n - 1, 0));
          }}
          onUndo={async () => {
            await wait(500);
            setDocuments((n) => n + 1);
          }}
        />
        <ConfirmMorph
          label="Remove line"
          prompt="Remove MR.KING 1.5L — Lemon?"
          tone="neutral"
          confirmLabel="Remove"
          pendingLabel="Removing"
          doneLabel="Removed"
          onConfirm={() => setCartLines((n) => Math.max(n - 1, 0))}
          onUndo={() => setCartLines((n) => n + 1)}
        />
        <ConfirmMorph
          label="Discard draft"
          prompt="Discard (this one fails)?"
          onConfirm={async () => {
            await wait(700);
            throw new Error("R2 refused the delete");
          }}
        />
      </div>
      <Outcome>{`${documents} documents · ${cartLines} cart lines`}</Outcome>
    </div>
  );
}

function SwipeActionsSpecimen() {
  const [lines, setLines] = useState(CART_LINES);
  const [flagged, setFlagged] = useState<string[]>([]);
  const remove = (id: string) => setLines((all) => all.filter((line) => line.id !== id));
  return (
    <div className="flex flex-col gap-sm">
      <SwipeActions label="Cart lines">
        {lines.map((line) => (
          <SwipeActionsRow
            key={line.id}
            label={line.product}
            leading={[
              {
                label: flagged.includes(line.id) ? "Unflag" : "Flag for review",
                icon: <MessageSquarePlus size={18} />,
                tone: "accent",
                keepRow: true,
                onSelect: () =>
                  setFlagged((all) =>
                    all.includes(line.id) ? all.filter((id) => id !== line.id) : [...all, line.id],
                  ),
              },
            ]}
            trailing={[
              {
                label: "Remove from cart",
                icon: <Trash2 size={18} />,
                tone: "danger",
                onSelect: () => remove(line.id),
              },
            ]}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[length:var(--text-body-sm)] text-ink" title={line.product}>
                {line.product}
                {flagged.includes(line.id) ? " · flagged" : ""}
              </span>
              <span className="truncate text-[length:var(--text-caption)] text-ink-tertiary" title={line.buyer}>
                {line.buyer} · {line.cartons} cartons · {formatMYR(line.amount)}
              </span>
            </div>
          </SwipeActionsRow>
        ))}
      </SwipeActions>
      <div className="flex flex-wrap items-center gap-sm">
        <Outcome>{`${lines.length} of ${CART_LINES.length} lines`}</Outcome>
        {lines.length < CART_LINES.length ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLines(CART_LINES);
              setFlagged([]);
            }}
          >
            Put them back
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function UserMenuSpecimen() {
  const [last, setLast] = useState("Signed in as Aisha Rahman");
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-md">
        <UserMenu
          user={{ name: "Aisha Rahman", email: "aisha@lovinghandsportal.com", plan: "Super admin" }}
          showTheme={false}
          showName
          align="start"
          items={[{ label: "Settings", icon: <Settings size={15} />, onSelect: () => setLast("Opened Settings") }]}
          onSignOut={async () => {
            await wait(900);
            setLast("Signed out");
          }}
        />
        <UserMenu
          user={{ name: "Chris Lam", email: "chris@lovinghandsportal.com", plan: "QC" }}
          showTheme={false}
          align="start"
          items={[{ label: "Settings", icon: <Settings size={15} />, onSelect: () => setLast("Chris opened Settings") }]}
          onSignOut={() => setLast("Chris signed out")}
        />
      </div>
      <Outcome>{last}</Outcome>
    </div>
  );
}

export function ActionsSection() {
  return (
    <GalleryGroup id="actions" title="Actions">
      <Specimen name="button" job="Every action: the ink pill primary, secondary, ghost and danger." phase={2}>
        <ButtonSpecimen />
      </Specimen>
      <Specimen name="action-button" job="Save and Confirm, with the label turning to progress and then done inside the button." phase={3}>
        <ActionButtonSpecimen />
      </Specimen>
      <Specimen name="split-button" job="Advance stage, with Move back and Add a note in its menu." phase={3}>
        <SplitButtonSpecimen />
      </Specimen>
      <Specimen name="dropdown-menu" job="Row menus (Move, Delete) and table overflow actions." phase={3}>
        <DropdownMenuSpecimen />
      </Specimen>
      <Specimen name="copy-button" job="Copy a PO number or an Order ID from a detail page." phase={3}>
        <CopyButtonSpecimen />
      </Specimen>
      <Specimen name="confirm-morph" job="Delete a document or a cart line in place, no dialog." phase={4}>
        <ConfirmMorphSpecimen />
      </Specimen>
      <Specimen name="swipe-actions" job="Swipe a cart line or a PO row on a phone to remove it." phase={5}>
        <SwipeActionsSpecimen />
      </Specimen>
      <Specimen name="user-menu" job="The sidebar account menu: email, role, Settings, Sign out." phase={2}>
        <UserMenuSpecimen />
      </Specimen>
    </GalleryGroup>
  );
}
