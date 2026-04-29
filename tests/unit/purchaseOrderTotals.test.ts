import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PurchaseOrderRequestError,
  computePurchaseOrderTotals,
  parseFxRateOrDefault,
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

// Task #369 (RF-3B): only GENUINELY blank fxRate falls back to the default.
// Non-blank but invalid (zero, negative, malformed, NaN, Infinity) MUST
// reject with 400 — pre-RF-3B these silently coerced or fell back.
test("falls back to default fxRate only when fxRate is genuinely blank", () => {
  for (const fx of [undefined, null, "", "   "] as const) {
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

test("rejects truly non-numeric unit price (parser returns null)", () => {
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

// Task #369 (RF-3B): the strict parser MUST reject every partially-numeric
// string and special-value string that the old parseFloat-based helper
// silently accepted. Pre-RF-3B these were passed through ("12abc" -> 12,
// "4.5abc" -> 4.5, "0x10" -> 0); now they must each return a 400 with the
// appropriate field-specific error message.
test("RF-3B: rejects partially-numeric and special-value unit price strings", () => {
  for (const bad of ["12abc", "4.5abc", "0x10", "Infinity", "NaN", "1e5", "0.5.5"]) {
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
      `unitPrice=${JSON.stringify(bad)} should be rejected by strict parser`,
    );
  }
});

test("RF-3B: rejects partially-numeric and special-value quantity strings", () => {
  for (const bad of ["12abc", "4.5abc", "0x10", "Infinity", "NaN", "abc"]) {
    assert.throws(
      () =>
        computePurchaseOrderTotals(
          [{ productId: 1, quantity: bad, unitPrice: 10 }],
          "AED",
          null,
        ),
      (err: unknown) => {
        assert.ok(err instanceof PurchaseOrderRequestError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.responseBody.error, "Quantity must be a number");
        return true;
      },
      `quantity=${JSON.stringify(bad)} should be rejected by strict parser`,
    );
  }
});

test("RF-3B: rejects partially-numeric and special-value fxRate strings", () => {
  for (const bad of ["12abc", "4.5abc", "0x10", "Infinity", "NaN", "abc"]) {
    assert.throws(
      () =>
        computePurchaseOrderTotals(
          [{ productId: 1, quantity: 1, unitPrice: 10 }],
          "GBP",
          bad,
        ),
      (err: unknown) => {
        assert.ok(err instanceof PurchaseOrderRequestError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.responseBody.error, "FX rate must be a positive number");
        return true;
      },
      `fxRate=${JSON.stringify(bad)} should be rejected by strict parser`,
    );
  }
});

test("RF-3B: rejects zero, negative, NaN, and Infinity fxRate (number form)", () => {
  for (const bad of [0, -1, -4.85, NaN, Infinity, -Infinity, "0", "-1", "-4.85"] as Array<
    number | string
  >) {
    assert.throws(
      () =>
        computePurchaseOrderTotals(
          [{ productId: 1, quantity: 1, unitPrice: 10 }],
          "GBP",
          bad,
        ),
      (err: unknown) => {
        assert.ok(err instanceof PurchaseOrderRequestError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.responseBody.error, "FX rate must be a positive number");
        return true;
      },
      `fxRate=${JSON.stringify(bad)} should reject as non-positive`,
    );
  }
});

test("RF-3B: rejects malformed productId on otherwise-valid line", () => {
  for (const bad of ["12abc", "0x10", "abc", "Infinity", "NaN", "1.5", -1, 0]) {
    assert.throws(
      () =>
        computePurchaseOrderTotals(
          [{ productId: bad, quantity: 1, unitPrice: 10 }],
          "AED",
          null,
        ),
      (err: unknown) => {
        assert.ok(err instanceof PurchaseOrderRequestError);
        assert.equal(err.statusCode, 400);
        assert.equal(
          err.responseBody.error,
          "Product ID must be a positive integer",
        );
        return true;
      },
      `productId=${JSON.stringify(bad)} should be rejected`,
    );
  }
});

test("RF-3B: clean numeric strings and whitespace-padded strings still parse", () => {
  // These are all valid inputs the UI / clients legitimately send.
  const r = computePurchaseOrderTotals(
    [
      { productId: "12", quantity: "2", unitPrice: "12.50" },
      { productId: " 7 ", quantity: " 3 ", unitPrice: " 0.5 " },
    ],
    "GBP",
    " 4.5 ",
  );
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].productId, 12);
  assert.equal(r.items[0].lineTotalStr, "25.00");
  assert.equal(r.items[1].productId, 7);
  assert.equal(r.items[1].lineTotalStr, "1.50");
  assert.equal(r.totalAmountStr, "26.50");
  assert.equal(r.grandTotalStr, (26.5 * 4.5).toFixed(2));
});

test("RF-3B: parseFxRateOrDefault contract — exported for header-only PUT", () => {
  // Blank values fall back to default.
  assert.equal(parseFxRateOrDefault(undefined), PO_DEFAULT_FX_RATE_TO_AED);
  assert.equal(parseFxRateOrDefault(null), PO_DEFAULT_FX_RATE_TO_AED);
  assert.equal(parseFxRateOrDefault(""), PO_DEFAULT_FX_RATE_TO_AED);
  assert.equal(parseFxRateOrDefault("   "), PO_DEFAULT_FX_RATE_TO_AED);

  // Clean numeric values pass through.
  assert.equal(parseFxRateOrDefault(4.5), 4.5);
  assert.equal(parseFxRateOrDefault("4.5"), 4.5);
  assert.equal(parseFxRateOrDefault(" 4.5 "), 4.5);
  assert.equal(parseFxRateOrDefault("12"), 12);

  // Anything else throws PurchaseOrderRequestError(400).
  for (const bad of [0, -1, NaN, Infinity, "0", "-1", "abc", "12abc", "Infinity", "NaN"]) {
    assert.throws(
      () => parseFxRateOrDefault(bad),
      (err: unknown) => {
        assert.ok(err instanceof PurchaseOrderRequestError);
        assert.equal(err.statusCode, 400);
        return true;
      },
      `parseFxRateOrDefault(${JSON.stringify(bad)}) should throw`,
    );
  }
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
