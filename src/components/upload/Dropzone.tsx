"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCEPT_ATTRIBUTE, formatBytes, MAX_FILE_BYTES } from "@/lib/validation/upload";

/**
 * Drop, browse and paste all funnel into the same `onFiles` (design reference
 * §3.3). Paste matters more than it looks: a screenshot of a PO is the most
 * common thing an ops person has on the clipboard.
 */
export function Dropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  /** Drag events fire per child element; counting keeps the state from flickering. */
  const depth = useRef(0);

  const handle = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      onFiles(Array.from(list));
    },
    [onFiles],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) onFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFiles]);

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        handle(event.dataTransfer.files);
      }}
      className={`flex min-h-80 flex-col items-center justify-center gap-sm rounded-xxl border-2 border-dashed p-xl text-center transition-colors duration-[0.25s] ease-[cubic-bezier(0.5,0,0.5,1)] ${
        dragging
          ? "border-primary bg-surface"
          : "border-hairline-strong bg-canvas"
      }`}
    >
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full bg-surface"
      >
        <Upload className="size-5 text-ink-secondary" strokeWidth={1.75} />
      </span>
      <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
        Drop PO files here
      </h2>
      <p className="text-[length:var(--text-body-md)] text-ink-secondary">
        PDF, PNG, JPG — up to {formatBytes(MAX_FILE_BYTES)} each
      </p>
      <Button
        type="button"
        variant="secondary"
        onClick={() => input.current?.click()}
      >
        Browse files
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        // Driven entirely by the Browse button. Left in the tab order it would
        // be a second, invisible stop announcing "Choose File".
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        // Cleared so choosing the same file twice in a row still fires change.
        onChange={(event) => {
          handle(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
