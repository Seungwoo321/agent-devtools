import type { JSX } from 'react';
import { computeOrderTotals, LINE_ITEMS } from './cart.js';
import { formatCents } from './money.js';

export function OrderSummary(): JSX.Element {
  const totals = computeOrderTotals(LINE_ITEMS);
  // A grand total more than double the subtotal can't be right for an 8%
  // tax — flag it so an obviously-off number doesn't slip past review.
  const looksInflated = totals.totalCents > totals.subtotalCents * 2;

  return (
    <section className="card" id="checkout-card">
      <h2>Checkout</h2>
      <p>
        Review your order before paying. An 8% tax on a $1,299.00 subtotal should land near $1,400.
      </p>
      <table className="order-summary">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Qty</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {LINE_ITEMS.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td className="num">{item.qty}</td>
              <td className="num">{formatCents(item.priceCents * item.qty)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Subtotal</td>
            <td className="num" data-testid="subtotal">
              {formatCents(totals.subtotalCents)}
            </td>
          </tr>
          <tr>
            <td colSpan={2}>Tax (8%)</td>
            <td className="num" data-testid="tax">
              {formatCents(totals.taxCents)}
            </td>
          </tr>
          <tr className={looksInflated ? 'grand-total-row is-wrong' : 'grand-total-row is-ok'}>
            <td colSpan={2}>
              Grand total
              {looksInflated && <span className="warn"> ⚠ looks off</span>}
            </td>
            <td className="num" data-testid="grand-total">
              {formatCents(totals.totalCents)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
