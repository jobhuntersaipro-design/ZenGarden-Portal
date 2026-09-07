import type { DraftLineItem, PoDraft } from "@/lib/validation/purchase-orders";
import { lineAmount } from "@/lib/validation/purchase-orders";

export type DraftAction =
  | { type: "field"; field: keyof PoDraft; value: string | null }
  | { type: "buyer"; buyerId: string | null; newBuyerName: string | null }
  | { type: "line"; index: number; field: keyof DraftLineItem; value: string | null }
  | { type: "addLine" }
  | { type: "removeLine"; index: number };

const EMPTY_LINE: DraftLineItem = {
  sku: null,
  description: "",
  productId: null,
  quantity: "1",
  unit: null,
  unitPrice: "0.00",
  amount: "0.00",
};

export function draftReducer(state: PoDraft, action: DraftAction): PoDraft {
  switch (action.type) {
    case "field":
      return { ...state, [action.field]: action.value } as PoDraft;

    case "buyer":
      return {
        ...state,
        buyerId: action.buyerId,
        newBuyerName: action.newBuyerName,
      };

    case "line": {
      const lineItems = state.lineItems.map((line, index) => {
        if (index !== action.index) return line;
        const next = { ...line, [action.field]: action.value } as DraftLineItem;

        // Editing the amount by hand pins it; the document may print something
        // that is not quantity × price, and that is information, not an error.
        if (action.field === "amount") next.amountManual = true;

        if (
          (action.field === "quantity" || action.field === "unitPrice") &&
          !next.amountManual
        ) {
          next.amount = lineAmount(next.quantity, next.unitPrice);
        }
        return next;
      });
      return { ...state, lineItems };
    }

    case "addLine":
      return { ...state, lineItems: [...state.lineItems, { ...EMPTY_LINE }] };

    case "removeLine":
      return {
        ...state,
        lineItems: state.lineItems.filter((_, index) => index !== action.index),
      };

    default:
      return state;
  }
}
