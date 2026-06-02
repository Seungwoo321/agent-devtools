import { addCents, applyTaxCents } from './money.js';

export interface LineItem {
  id: string;
  name: string;
  qty: number;
  /** Unit price, in cents. */
  priceCents: number;
}

export const TAX_RATE = 0.08;

/** Order contents. Subtotal is exactly 129900¢ ($1,299.00). */
export const LINE_ITEMS: LineItem[] = [
  { id: 'kbd', name: 'Mechanical keyboard', qty: 1, priceCents: 89900 },
  { id: 'mse', name: 'Wireless mouse', qty: 1, priceCents: 24900 },
  { id: 'pad', name: 'Desk mat', qty: 2, priceCents: 7550 },
];

export interface OrderTotals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

/** Sum of every line item (unit price × quantity), in cents. */
export function computeSubtotalCents(items: LineItem[]): number {
  return items.reduce((sum, item) => addCents(sum, item.priceCents * item.qty), 0);
}

/** Subtotal, tax, and grand total for an order — all in cents. */
export function computeOrderTotals(items: LineItem[]): OrderTotals {
  const subtotalCents = computeSubtotalCents(items);
  const taxCents = applyTaxCents(subtotalCents, TAX_RATE);
  const totalCents = addCents(subtotalCents, taxCents);
  return { subtotalCents, taxCents, totalCents };
}
