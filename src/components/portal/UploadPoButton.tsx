import Link from "next/link";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { Button } from "@/components/ui/button";

/**
 * The only way into `/upload`. Upload is an action, not a destination, so it
 * never appears in the sidebar (00-master.md §4, docs/specs/03-upload.md §2).
 * `buyerId` carries buyer detail's context through to the review screen.
 */
export function UploadPoButton({ buyerId }: { buyerId?: string }) {
  return (
    <Button asChild>
      <Link href={buyerId ? `/upload?buyer=${encodeURIComponent(buyerId)}` : "/upload"}>
        <LinkSpinner />
        Upload PO
      </Link>
    </Button>
  );
}
