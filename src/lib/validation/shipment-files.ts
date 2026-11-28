import { z } from "zod";
import { ShipmentDocType } from "@/generated/prisma/enums";
import {
  PO_DOCUMENT_ACCEPT,
  PO_DOCUMENT_TYPES,
  PO_DOCUMENT_WRONG_TYPE,
  poDocumentRejectionReason,
  resolvePoDocumentType,
  type PoDocumentMimeType,
} from "@/lib/validation/po-files";

/**
 * Shipping papers (Phase 63): the order documents' rule — PDF, JPG, PNG or
 * ZIP, 25 MB, checked from the leading bytes. A zip is kept as one opaque
 * file: it downloads, it is never previewed or read.
 */
export const SHIPMENT_FILE_ACCEPT = PO_DOCUMENT_ACCEPT;
export const SHIPMENT_WRONG_TYPE = PO_DOCUMENT_WRONG_TYPE;
export const SHIPMENT_FILE_HINT = "PDF, JPG, PNG or ZIP, up to 25 MB";

export const shipmentFileType = resolvePoDocumentType;
export const shipmentFileRejection = poDocumentRejectionReason;
export const shipmentFileExt = (type: PoDocumentMimeType) => PO_DOCUMENT_TYPES[type].ext;
export const isZipDocument = (mimeType: string) => mimeType === "application/zip";

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
