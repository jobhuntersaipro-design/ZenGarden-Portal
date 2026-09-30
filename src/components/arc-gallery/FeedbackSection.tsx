"use client";

import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/arc/alert/alert";
import Toast from "@/components/arc/toast/toast";
import {
  ToastStack,
  ToastStackProvider,
  useToastStack,
} from "@/components/arc/toast-stack/toast-stack";
import { Progress } from "@/components/arc/progress/progress";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Stepper, type StepperStep } from "@/components/arc/stepper/stepper";
import { TextMorph } from "@/components/arc/text-morph/text-morph";
import { TextShimmer } from "@/components/arc/text-shimmer/text-shimmer";
import { GalleryGroup, Specimen } from "./Specimen";

const ROW = "flex flex-wrap items-center gap-sm";
const CAPTION = "text-[length:var(--text-body-sm)] text-ink-secondary";

const PO_STAGES: StepperStep[] = [
  { id: "placed", label: "Order placed" },
  { id: "production", label: "In production" },
  { id: "qc", label: "QC passed" },
  { id: "warehouse", label: "In warehouse" },
  { id: "delivering", label: "Delivering" },
  { id: "delivered", label: "Delivered" },
];

const CHECKOUT_STEPS: StepperStep[] = [
  { id: "cart", label: "Cart" },
  { id: "review", label: "Review" },
  { id: "confirm", label: "Confirm" },
  { id: "received", label: "Received", description: "Our team will be in touch" },
];

function AlertSpecimen() {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col gap-sm">
      <Alert tone="info" title="Stock is not counted yet.">
        Stock count (carton) reads — until someone enters a count.
      </Alert>
      <Alert tone="success" title="Password updated. Sign in." />
      <Alert tone="warning" title="11 buyers have no market.">
        They can sign in, but see no products and can place no orders.
      </Alert>
      <Alert tone="danger" title="Wrong email or password." />
      <Alert
        tone="info"
        title="Dismissible"
        open={open}
        onDismiss={() => setOpen(false)}
      >
        Close it with the ✕; it collapses rather than jumping.
      </Alert>
      {open ? null : (
        <div>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            <RotateCcw aria-hidden="true" />
            Show it again
          </Button>
        </div>
      )}
    </div>
  );
}

function ToastSpecimen() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  return (
    <div className="flex flex-col gap-sm">
      <div className={ROW}>
        <Button
          variant="secondary"
          onClick={() => {
            setCount((n) => n + 1);
            setOpen(true);
          }}
        >
          Save details
        </Button>
      </div>
      <Toast
        open={open}
        onOpenChange={setOpen}
        title="Details saved"
        description={`Kelana Steel · save ${count}`}
      />
    </div>
  );
}

function ToastStackTriggers() {
  const { toast, update, dismiss, count } = useToastStack();
  const seq = useRef(0);
  function upload() {
    seq.current += 1;
    const batch = seq.current;
    const id = toast({
      type: "loading",
      title: "Uploading 23 files",
      description: "Invoices",
    });
    window.setTimeout(() => {
      update(id, {
        type: "success",
        title: "23 of 23 saved in Invoices",
        description: `Batch ${batch}`,
      });
    }, 1600);
    toast({
      type: "warning",
      title: "archive.zip was refused",
      description: "Only PDF, images, Word and Excel.",
    });
  }
  return (
    <div className={ROW}>
      <Button variant="secondary" onClick={upload}>
        Upload 23 files
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({ type: "info", title: "Moved to In warehouse" })
        }
      >
        One more
      </Button>
      <Button
        variant="secondary"
        disabled={count === 0}
        onClick={() => dismiss()}
      >
        Clear all
      </Button>
    </div>
  );
}

function ToastStackSpecimen() {
  return (
    <ToastStackProvider>
      <div className="relative flex min-h-60 flex-col gap-sm overflow-hidden rounded-md border border-hairline bg-surface-soft p-sm">
        <ToastStackTriggers />
        <ToastStack contained hotkey={false} label="Upload results" />
      </div>
    </ToastStackProvider>
  );
}

function ProgressSpecimen() {
  const [value, setValue] = useState(35);
  return (
    <div className="flex flex-col gap-md">
      <Progress value={72} label="Price list Q4.xlsx" showValue />
      <Progress value={100} label="SSM certificate.pdf" showValue />
      <Progress value={value} label="PO-2026-0071.pdf" showValue />
      <div className={ROW}>
        <Button
          variant="secondary"
          disabled={value >= 100}
          onClick={() => setValue((v) => Math.min(100, v + 20))}
        >
          Advance 20%
        </Button>
        <Button variant="secondary" onClick={() => setValue(0)}>
          Reset
        </Button>
      </div>
    </div>
  );
}

function SkeletonSpecimen() {
  const [loading, setLoading] = useState(true);
  return (
    <div className="flex flex-col gap-md">
      <Skeleton label="Loading buyers" avatar lines={3} />
      <Skeleton label="Loading purchase order" loading={loading}>
        <p className={CAPTION}>
          PO number PO-2026-0039 · Meridian Chemicals · RM 3,761.97
        </p>
      </Skeleton>
      <div className={ROW}>
        <Button variant="secondary" onClick={() => setLoading((l) => !l)}>
          {loading ? "Finish loading" : "Load again"}
        </Button>
      </div>
    </div>
  );
}

function StepperSpecimen() {
  const [stage, setStage] = useState(2);
  const [step, setStep] = useState(1);
  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm">
        <Stepper
          steps={PO_STAGES}
          current={stage}
          onStepSelect={setStage}
          label="Purchase order stage"
          completeLabel="Delivered"
        />
        <div className={ROW}>
          <Button
            variant="secondary"
            disabled={stage === 0}
            onClick={() => setStage((s) => Math.max(0, s - 1))}
          >
            Move back
          </Button>
          <Button
            variant="secondary"
            disabled={stage >= PO_STAGES.length}
            onClick={() => setStage((s) => Math.min(PO_STAGES.length, s + 1))}
          >
            Advance
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-sm">
        <Stepper
          steps={CHECKOUT_STEPS}
          current={step}
          onStepSelect={setStep}
          details="current"
          label="Checkout"
          completeLabel="Received by the team"
        />
        <div className={ROW}>
          <Button
            variant="secondary"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          <Button
            variant="secondary"
            disabled={step >= CHECKOUT_STEPS.length}
            onClick={() =>
              setStep((s) => Math.min(CHECKOUT_STEPS.length, s + 1))
            }
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function TextMorphSpecimen() {
  const [added, setAdded] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  return (
    <div className={ROW}>
      <Button onClick={() => setAdded((a) => !a)}>
        <TextMorph>{added ? "Added ✓" : "Add to cart"}</TextMorph>
      </Button>
      <Button variant="secondary" onClick={() => setAdvancing((a) => !a)}>
        <TextMorph>{advancing ? "Advancing…" : "Advance"}</TextMorph>
      </Button>
    </div>
  );
}

function TextShimmerSpecimen() {
  const [reading, setReading] = useState(true);
  return (
    <div className="flex flex-col gap-sm">
      <TextShimmer
        as="p"
        active={reading}
        className="text-[length:var(--text-body-md)] text-ink"
      >
        {reading ? "Reading this document…" : "Read. Review the draft."}
      </TextShimmer>
      <div className={ROW}>
        <Button variant="secondary" onClick={() => setReading((r) => !r)}>
          {reading ? "Finish reading" : "Read again"}
        </Button>
      </div>
    </div>
  );
}

export function FeedbackSection() {
  return (
    <GalleryGroup id="feedback" title="Feedback and text">
      <Specimen
        name="alert"
        job="No-market alert, “stock is not counted yet”, sign-in notices."
        phase={4}
      >
        <AlertSpecimen />
      </Specimen>
      <Specimen name="toast" job="The result of every action." phase={2}>
        <ToastSpecimen />
      </Specimen>
      <Specimen
        name="toast-stack"
        job="Several results at once, e.g. 23 files uploaded."
        phase={3}
      >
        <ToastStackSpecimen />
      </Specimen>
      <Specimen name="progress" job="Per-file upload progress." phase={3}>
        <ProgressSpecimen />
      </Specimen>
      <Specimen name="skeleton" job="Route loading skeletons." phase={2}>
        <SkeletonSpecimen />
      </Specimen>
      <Specimen
        name="stepper"
        job="The six PO stages, and the shop's four checkout steps."
        phase={3}
      >
        <StepperSpecimen />
      </Specimen>
      <Specimen
        name="text-morph"
        job="Labels that change: Add → Added ✓, Advance → Advancing…"
        phase={5}
      >
        <TextMorphSpecimen />
      </Specimen>
      <Specimen
        name="text-shimmer"
        job="“Reading this document…” while Claude extracts."
        phase={3}
      >
        <TextShimmerSpecimen />
      </Specimen>
    </GalleryGroup>
  );
}
