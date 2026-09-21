"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { printScale } from "@/lib/planning/print-scale";

/** The board's own marker, so the measuring never has to guess at a selector. */
const BOARD = "[data-board-print]";

/**
 * Print the board, which is also how it is saved as a PDF — every browser's
 * print dialog offers "Save as PDF" as a destination, so one control covers
 * both and there is no second file format to keep in step with the screen.
 *
 * **The board is scaled to the page before printing.** Thirty day columns are
 * about 1,800px wide and a landscape A4 page holds ~1,032, so left alone the
 * right-hand third of the board would simply be cut off — the exact failure
 * the on-screen scroller exists to prevent, arriving on paper. CSS cannot
 * measure, so the factor is computed here from the table's real width and set
 * as `zoom`, the same property the purchase-order sheet already prints
 * through. It is only ever shrunk: a narrow board prints at its own size
 * rather than being blown up to fill the sheet.
 *
 * `afterprint` puts the zoom back. It fires on cancel as well as on a
 * completed print, which matters because `window.print()` blocks in some
 * browsers and returns immediately in others — resetting on the line after
 * the call would leave the paper scaled in one and the screen scaled in the
 * other.
 */
export function PrintBoard() {
  useEffect(() => {
    const reset = () => {
      const board = document.querySelector<HTMLElement>(BOARD);
      if (board) board.style.zoom = "";
    };
    window.addEventListener("afterprint", reset);
    return () => {
      window.removeEventListener("afterprint", reset);
      reset();
    };
  }, []);

  const print = () => {
    const board = document.querySelector<HTMLElement>(BOARD);
    if (board) {
      // `scrollWidth` is the whole board including the part scrolled out of
      // view, which is the figure that has to fit the page — `clientWidth`
      // is only what the frame is showing.
      const scale = printScale(board.scrollWidth);
      board.style.zoom = scale === null ? "" : String(scale);
    }
    window.print();
  };

  return (
    // The button is inside the print region — it has to be, to sit in the
    // page header — so it takes itself out of what it prints.
    <span data-print-hide>
      <Button variant="secondary" onClick={print}>
        <Printer aria-hidden className="size-4" />
        Print or save as PDF
      </Button>
    </span>
  );
}
