import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PurchaseOrderRequestError,
  computePurchaseOrderTotals,
  PO_DEFAULT_FX_RATE_TO_AED,
} from "../../server/lib/purchaseOrderTotals";

test("ignores client-supplied lineTotal and recomputes qty * unitPrice", () => {
  const result = computePurchaseOrderTotals(
    [
      {
        productId: 7,
        quantity: 1,
        unitPrice: 100,
        // Poisoned by malicious / buggy client — must be ignored.
        lineTotal: 999999,
        productName: "Widget",
        size: "M",
      },
    ],
    "AED",
    null,
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].lineTotalStr, "100.00");
  assert.equal(result.items[0].unitPriceStr, "100.00");
  assert.equal(result.items[0].productId, 7);
  assert.equal(result.items[0].descriptionOverride, "Widget");
  assert.equal(result.items[0].sizeOverride, "M");
  assert.equal(result.totalAmountStr, "100.00");
  // currency = AED → grandTotal === totalAmount, fx is irrelevant.
  assert.equal(result.grandTotalStr, "100.00");
});

test("sums multiple lines and applies fxRate when currency is non-AED", () => {
  const result = computePurchaseOrderTotals(
    [
      { productId: 1, quantity: 2, unitPrice: 12.5 }, // 25.00
      { productId: 2, quantity: 3, unitPrice: 7 }, //   21.00
    ],
    "GBP",
    "4.5",
  );
  assert.equal(result.totalAmountStr, "46.00");
  assert.equal(result.grandTotalStr, (46 * 4.5).toFixed(2)); // 207.00
});

test("falls back to default fxRate when fxRate is missing, empty, NaN, or zero", () => {
  for (const fx of [undefined, null, "", "   ", "abc", 0, "0"] as const) {
    const r = computePurchaseOrderTotals(
      [{ productId: 1, quantity: 1, unitPrice: 10 }],
      "GBP",
      fx,
    );
    assert.equal(
      r.grandTotalStr,
      (10 * PO_DEFAULT_FX_RATE_TO_AED).toFixed(2),
      `fx=${String(fx)}`,
    );
  }
});

test("rejects negative quantity with the contract error message", () => {
  assert.throws(
    () =>
      computePurchaseOrderTotals(
        [{ productId: 1, quantity: -1, unitPrice: 10 }],
        "AED",
        null,
      ),
    (err: unknown) => {
      assert.ok(err instanceof PurchaseOrderRequestError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.responseBody.error, "Quantity cannot be negative");
      return true;
    },
  );
});

test("rejects negative unit price with the today-compatible error message", () => {
  assert.throws(
    () =>
      computePurchaseOrderTotals(
        [{ productId: 1, quantity: 1, unitPrice: -5 }],
        "AED",
        null,
      ),
    (err: unknown) => {
      assert.ok(err instanceof PurchaseOrderRequestError);
      assert.equal(err.statusCode, 400);
      assert.equal(err.responseBody.error, "Unit price cannot be negative");
      return true;
    },
  );
});

test("rejects truly non-numeric unit price (parseFloat returns NaN)", () => {
  for (const bad of ["not-a-number", "abc", "abc123"]) {
    assert.throws(
      () =>
        computePurchaseOrderTotals(
          [{ productId: 1, quantity: 1, unitPrice: bad }],
          "AED",
          null,
        ),
      (err: unknown) => {
        assert.ok(err instanceof PurchaseOrderRequestError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.responseBody.error, "Unit price must be a number");
        return true;
      },
      `unitPrice=${JSON.stringify(bad)} should be rejected`,
    );
  }
});

test("rejects invalid unitPrice on a would-be-skipped line — invalidates the whole request", () => {
  // Even when a line would normally be silently skipped (no productId
  // or qty=0), an invalid unitPrice on that line must still abort the
  // entire request rather than slip through.
  for (const skippedLine of [
    { quantity: 1, unitPrice: "abc" },               // missing productId
    { productId: 1, quantity: 0, unitPrice: "abc" }, // zero qty
  ]) {
    assert.throws(
      () =>
        computePurchaseOrderTotals(
          [
            skippedLine,
            { productId: 2, quantity: 3, unitPrice: 10 }, // valid line in same payload
          ],
          "AED",
          null,
        ),
      (err: unknown) => {
        assert.ok(err instanceof PurchaseOrderRequestError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.responseBody.error, "Unit price must be a number");
        return true;
      },
      `payload with skipped line ${JSON.stringify(skippedLine)} must reject for bad unitPrice`,
    );
  }

  // Same for negative unitPrice on a skipped line.
  assert.throws(
    () =>
      computePurchaseOrderTotals(
        [
          { productId: 1, quantity: 0, unitPrice: -5 },
          { productId: 2, quantity: 3, unitPrice: 10 },
        ],
        "AED",
        null,
      ),
    (err: unknown) => {
      assert.ok(err instanceof PurchaseOrderRequestError);
      assert.equal(err.responseBody.error, "Unit price cannot be negative");
      return true;
    },
  );
});

test("preserves prior parseFloat() coercion semantics for partially-numeric strings", () => {
  // parseFloat("12abc") === 12 — today's route accepts this, so we must too.
  // Number("12abc") would be NaN and throw — this test pins that we did NOT
  // tighten the contract for in-flight clients sending loosely-formatted
  // numeric strings.
  const r = computePurchaseOrderTotals(
    [{ productId: 1, quantity: 1, unitPrice: "12abc" }],
    "AED",
    null,
  );
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].unitPriceStr, "12.00");
  assert.equal(r.items[0].lineTotalStr, "12.00");
});

test("preserves prior parseFloat() coercion semantics for fxRate edge cases", () => {
  // parseFloat("4.5abc") === 4.5 — today's route used 4.5 as the fx, so
  // grandTotal must still be totalAmount * 4.5 (NOT the default 4.85).
  const r1 = computePurchaseOrderTotals(
    [{ productId: 1, quantity: 1, unitPrice: 10 }],
    "GBP",
    "4.5abc",
  );
  assert.equal(r1.grandTotalStr, (10 * 4.5).toFixed(2));

  // parseFloat("0x10") === 0 → today's `0 || 4.85` falls back to 4.85.
  // (Number("0x10") would be 16 — must NOT happen here.)
  const r2 = computePurchaseOrderTotals(
    [{ productId: 1, quantity: 1, unitPrice: 10 }],
    "GBP",
    "0x10",
  );
  assert.equal(r2.grandTotalStr, (10 * PO_DEFAULT_FX_RATE_TO_AED).toFixed(2));
});

test("silently skips lines without productId or with zero qty", () => {
  const result = computePurchaseOrderTotals(
    [
      { productId: null, quantity: 5, unitPrice: 10 },
      { productId: 1, quantity: 0, unitPrice: 10 },
      { productId: 3, quantity: 2, unitPrice: 50 }, // only this one survives
    ],
    "AED",
    null,
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].productId, 3);
  assert.equal(result.totalAmountStr, "100.00");
});

test("rejects non-integer quantity with a clear 400 — the quantity column is integer-typed", () => {
  for (const badQty of [1.5, "2.5", 0.1]) {
    assert.throws(
      () =>
        computePurchaseOrderTotals(
          [{ productId: 1, quantity: badQty, unitPrice: 10 }],
          "AED",
          null,
        ),
      (err: unknown) => {
        assert.ok(err instanceof PurchaseOrderRequestError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.responseBody.error, "Quantity must be a whole number");
        return true;
      },
      `quantity=${JSON.stringify(badQty)} should be rejected`,
    );
  }
});

test("empty / missing items array returns zero totals", () => {
  for (const items of [undefined, null, []] as const) {
    const r = computePurchaseOrderTotals(items as never, "AED", null);
    assert.deepEqual(r.items, []);
    assert.equal(r.totalAmountStr, "0.00");
    assert.equal(r.grandTotalStr, "0.00");
  }
});

test("rounds half-pennies consistently per line and on the total", () => {
  // 3 * 0.335 = 1.005 → round to 1.01 per line; total = 1.01.
  const r = computePurchaseOrderTotals(
    [{ productId: 1, quantity: 3, unitPrice: 0.335 }],
    "AED",
    null,
  );
  assert.equal(r.items[0].lineTotalStr, "1.01");
  assert.equal(r.totalAmountStr, "1.01");
});

test("coerces string productId / quantity / unitPrice the way request bodies arrive", () => {
  const r = computePurchaseOrderTotals(
    [{ productId: "42", quantity: "4", unitPrice: "12.5" }],
    "GBP",
    "5",
  );
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].productId, 42);
  assert.equal(r.items[0].quantity, 4);
  assert.equal(r.items[0].unitPriceStr, "12.50");
  assert.equal(r.items[0].lineTotalStr, "50.00");
  assert.equal(r.totalAmountStr, "50.00");
  assert.equal(r.grandTotalStr, "250.00");
});
