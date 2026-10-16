import { z } from "zod";
import { ShipmentDocType } from "@/generated/prisma/enums";
import {
  PO_DOCUMENT_TYPES,
  poDocumentRejectionReason,
  resolvePoDocumentType,
  type PoDocumentMimeType,
} from "@/lib/validation/po-files";

/**
 * Shipping papers (Phase 63): the order documents' rule — PDF, JPG or PNG,
 * 25 MB, checked from the leading bytes — less ZIP, which can be neither
 * previewed nor read.
 */
export const SHIPMENT_FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg";
export const SHIPMENT_WRONG_TYPE = "That file type isn't supported — use PDF, JPG or PNG";

export function shipmentFileType(name: string, type: string): Exclude<PoDocumentMimeType, "application/zip"> | null {
  const resolved = resolvePoDocumentType(name, type);
  return resolved && resolved !== "application/zip" ? resolved : null;
}

export function shipmentFileRejection(file: { name: string; type: string; size: number }): string | null {
  if (!shipmentFileType(file.name, file.type)) return SHIPMENT_WRONG_TYPE;
  return poDocumentRejectionReason(file);
}

export const shipmentFileExt = (type: Exclude<PoDocumentMimeType, "application/zip">) => PO_DOCUMENT_TYPES[type].ext;

export const docTypeSchema = z.enum(ShipmentDocType);

/** `shipments/{shipmentId}/{uuid}.{ext}` — the only shape `complete` accepts. */
export const shipmentDocumentKey = (shipmentId: string, uuid: string, ext: string) =>
  `shipments/${shipmentId}/${uuid}.${ext}`;

export function isShipmentDocumentKey(key: string, shipmentId: string, ext: string): boolean {
  if (!/^[a-zA-Z0-9_-]+$/.test(shipmentId)) return false;
  return new RegExp(
    `^shipments/${shipmentId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.${ext}$`,
  ).test(key);
}
