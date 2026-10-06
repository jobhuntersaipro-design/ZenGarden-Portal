"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { DocumentPreview } from "@/components/review/DocumentPreviewLoader";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDate } from "@/lib/dates";
import type { BuyerOrderDocumentRow } from "@/lib/queries/purchase-order-documents";
import { shopHref } from "@/lib/shop-routes";

const ACTION =
  "h-control-md min-w-11 gap-xxs px-sm text-[length:var(--text-caption)] sm:h-control-sm sm:min-w-0";

/**
 * Files staff attached to this purchase order. Read-only: there is no upload,
 * rename or delete, and the links go through the shop route that checks the
 * order belongs to the signed-in buyer.
 */
export function BuyerOrderDocuments({
  purchaseOrderId,
  documents,
}: {
  /** Set when this page is a purchase order. Unused while the list is empty. */
  purchaseOrderId: string | null;
  documents: BuyerOrderDocumentRow[];
}) {
  const [previewing, setPreviewing] = useState<BuyerOrderDocumentRow | null>(null);

  return (
    <section className="mt-lg min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">Documents</h2>
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
        Files attached to this order.
      </p>

      {documents.length === 0 ? (
        <p className="mt-sm text-[length:var(--text-body-sm)] text-ink-secondary">
          No documents on this order yet.
        </p>
      ) : (
        <ul className="mt-sm flex min-w-0 flex-col">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex min-w-0 flex-wrap items-center gap-sm border-b border-hairline py-xs"
            >
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <p className="truncate text-[length:var(--text-body-sm)] text-ink" title={document.name}>
                  {document.name}
                </p>
                <p className="truncate text-[length:var(--text-caption)] text-ink-tertiary">
                  {formatDate(document.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-xs">
                <Button
                  type="button"
                  variant="secondary"
                  className={ACTION}
                  onClick={() => setPreviewing(document)}
                >
                  Open
                </Button>
                {purchaseOrderId ? (
                  <Button variant="secondary" className={ACTION} asChild>
                    <a href={shopHref.orderDocumentDownload(purchaseOrderId, document.id)}>
                      <Download aria-hidden className="size-3.5" />
                      Download
                    </a>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={previewing !== null} onOpenChange={(open) => !open && setPreviewing(null)}>
        <SheetContent className="w-full sm:max-w-panel-xl">
          <SheetHeader>
            <SheetTitle className="truncate pr-lg" title={previewing?.name}>
              {previewing?.name}
            </SheetTitle>
            <SheetDescription>
              {previewing ? formatDate(previewing.createdAt) : null}
            </SheetDescription>
          </SheetHeader>
          {previewing && purchaseOrderId ? (
            <div className="flex min-w-0 flex-col gap-sm p-md pt-0">
              <DocumentPreview
                key={previewing.id}
                documentId={previewing.id}
                originalName={previewing.name}
                urlEndpoint={shopHref.orderDocumentUrl(purchaseOrderId, previewing.id)}
                download={
                  <Button variant="secondary" asChild>
                    <a href={shopHref.orderDocumentDownload(purchaseOrderId, previewing.id)}>
                      Download
                    </a>
                  </Button>
                }
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
