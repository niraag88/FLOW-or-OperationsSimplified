/**
 * Task #366 (RF-3): PO POST atomicity & zero-valid-line rejection.
 *
 * Two gaps closed by this spec:
 *  1. POST is now atomic — a failure inside the item-loop (e.g. an
 *     invalid productId triggering a 23503) must roll back the
 *     header insert, leaving NO orphan PO behind.
 *  2. POST and PUT must reject with 400 when the items array is
 *     non-empty but every line is skipped by computePurchaseOrderTotals
 *     (no productId or qty <= 0) — previously a header-only PO with
 *     zero totals would slip through.
 *
 * The existing `if (!req.body.items || ... .length === 0)` guard
 * (literally empty array) is preserved as the first guard and stays
 * out of scope here — covered already by other specs.
 */
import { test, expect } from '@playwright/test';
import {
  apiLogin, apiGet, apiPost, apiPut, apiDelete,
  toProductList, toPurchaseOrderList,
  productPrice, ApiProduct, ApiPurchaseOrder,
} from './helpers';

interface ApiBrand { id: number; name: string; }

const ZERO_VALID_LINE_ERROR =
  'At least one valid line item is required to save a purchase order';

async function poCount(cookie: string): Promise<number> {
  const raw = await apiGet('/api/purchase-orders?pageSize=10000', cookie);
  return toPurchaseOrderList(raw).length;
}

interface AuditRow {
  action?: string;
  targetType?: string;
  targetId?: string;
  details?: string;
}
async function poCreateAuditCount(cookie: string): Promise<number> {
  const rows = (await apiGet('/api/audit-logs', cookie)) as AuditRow[];
  return Array.isArray(rows)
    ? rows.filter(
        (r) => r.action === 'CREATE' && r.targetType === 'purchase_order',
      ).length
    : 0;
}

test.describe('PO POST atomicity & zero-valid-line rejection (Task #366, RF-3)', () => {
  let cookie: string;
  let brandId: number;
  let product: ApiProduct;
  const createdPOIds: number[] = [];

  test.beforeAll(async () => {
    cookie = await apiLogin();

    const brandsRaw = await apiGet('/api/brands', cookie) as
      | ApiBrand[] | { brands?: ApiBrand[] };
    const brandList: ApiBrand[] = Array.isArray(brandsRaw)
      ? brandsRaw
      : (brandsRaw.brands ?? []);
    brandId = brandList[0]?.id ?? 0;

    const prodsRaw = await apiGet('/api/products', cookie);
    const prodList = toProductList(prodsRaw);
    product = prodList[0]!;
  });

  test.afterAll(async () => {
    for (const id of createdPOIds) {
      await apiDelete(`/api/purchase-orders/${id}`, cookie).catch(() => {});
    }
  });

  // ─── POST: zero-valid-items rejection ───────────────────────────
  test('POST with non-empty items array but every line skip-able → 400 + no PO created', async () => {
    test.skip(!brandId, 'Requires at least one brand');
    const before = await poCount(cookie);

    // Two lines that the helper legitimately skips: one with no
    // productId, one with qty <= 0. Array IS non-empty, so the
    // first "items array is empty" guard does NOT fire — the
    // post-compute guard added by RF-3 must catch this.
    const { status, data } = await apiPost('/api/purchase-orders', {
      brandId,
      orderDate: '2026-04-29',
      expectedDelivery: '2026-05-29',
      status: 'draft',
      notes: 'RF-3 zero-valid-line POST',
      items: [
        { productId: null, description: 'no product', quantity: 5, unitPrice: 10 },
        { productId: product.id, description: product.name, quantity: 0, unitPrice: 10 },
      ],
    }, cookie);

    expect(status).toBe(400);
    expect((data as { error?: string }).error).toBe(ZERO_VALID_LINE_ERROR);

    const after = await poCount(cookie);
    expect(after).toBe(before);
  });

  // ─── POST: atomicity on item-insert failure ─────────────────────
  test('POST with one valid line and one FK-bad productId → header AND audit row rolled back', async () => {
    test.skip(!brandId || !product, 'Requires at least one brand and one product');
    const before = await poCount(cookie);
    const beforeAudit = await poCreateAuditCount(cookie);

    // First line is real (passes compute, would insert OK), second
    // line uses a non-existent productId so the per-item insert
    // raises FK 23503 inside the transaction. The header insert
    // earlier in the SAME tx must roll back. The audit-log row is
    // also written inside the tx (Task #366), so it must roll back too.
    const { status } = await apiPost('/api/purchase-orders', {
      brandId,
      orderDate: '2026-04-29',
      expectedDelivery: '2026-05-29',
      status: 'draft',
      notes: 'RF-3 atomicity POST',
      items: [
        {
          productId: product.id,
          description: product.name,
          quantity: 1,
          unitPrice: productPrice(product),
          lineTotal: productPrice(product),
        },
        {
          productId: 999999999,
          description: 'fake product',
          quantity: 1,
          unitPrice: 1,
          lineTotal: 1,
        },
      ],
    }, cookie);

    // Status will be 500 (FK violation isn't a PurchaseOrderRequestError)
    // — what matters for this task is that the rollback happened.
    expect(status).not.toBe(201);

    const after = await poCount(cookie);
    expect(after).toBe(before);
    const afterAudit = await poCreateAuditCount(cookie);
    expect(afterAudit).toBe(beforeAudit);
  });

  // ─── POST: happy path still works ───────────────────────────────
  test('POST with one valid line → 201 + PO has matching items + totals + audit row written', async () => {
    test.skip(!brandId || !product, 'Requires at least one brand and one product');

    const qty = 3;
    const unit = productPrice(product);
    const expectedTotal = (qty * unit).toFixed(2);
    const beforeAudit = await poCreateAuditCount(cookie);

    const { status, data } = await apiPost('/api/purchase-orders', {
      brandId,
      orderDate: '2026-04-29',
      expectedDelivery: '2026-05-29',
      status: 'draft',
      notes: 'RF-3 happy POST',
      items: [{
        productId: product.id,
        description: product.name,
        quantity: qty,
        unitPrice: unit,
        lineTotal: qty * unit,
      }],
    }, cookie);

    expect(status).toBe(201);
    const created = data as ApiPurchaseOrder;
    expect(created.id).toBeTruthy();
    createdPOIds.push(created.id);

    const detail = await apiGet(`/api/purchase-orders/${created.id}/detail`, cookie) as {
      totalAmount?: string;
      items?: Array<unknown>;
    };
    expect(Array.isArray(detail.items) && detail.items!.length).toBe(1);
    expect(detail.totalAmount).toBe(expectedTotal);

    const afterAudit = await poCreateAuditCount(cookie);
    expect(afterAudit).toBe(beforeAudit + 1);
  });

  // ─── PUT: zero-valid-items rejection ────────────────────────────
  test('PUT with items array but every line skip-able → 400 + PO unchanged', async () => {
    test.skip(!brandId || !product, 'Requires at least one brand and one product');

    // Seed a real PO first so we have something to attempt-edit.
    const qty = 2;
    const unit = productPrice(product);
    const seedRes = await apiPost('/api/purchase-orders', {
      brandId,
      orderDate: '2026-04-29',
      expectedDelivery: '2026-05-29',
      status: 'draft',
      notes: 'RF-3 PUT-target',
      items: [{
        productId: product.id,
        description: product.name,
        quantity: qty,
        unitPrice: unit,
        lineTotal: qty * unit,
      }],
    }, cookie);
    expect(seedRes.status).toBe(201);
    const seeded = seedRes.data as ApiPurchaseOrder;
    createdPOIds.push(seeded.id);

    const detailBefore = await apiGet(`/api/purchase-orders/${seeded.id}/detail`, cookie) as {
      totalAmount?: string;
      notes?: string;
      items?: Array<unknown>;
    };
    const totalBefore = detailBefore.totalAmount;
    const notesBefore = detailBefore.notes;
    const itemCountBefore = detailBefore.items?.length ?? 0;
    // Sanity: the seed must have produced a real, asserted baseline,
    // otherwise the post-rejection assertions would pass vacuously.
    expect(totalBefore).toBeTruthy();
    expect(itemCountBefore).toBe(1);

    const { status, data } = await apiPut(`/api/purchase-orders/${seeded.id}`, {
      notes: 'RF-3 PUT zero-valid attempt',
      items: [
        { productId: null, description: 'no product', quantity: 5, unitPrice: 10 },
        { productId: product.id, description: product.name, quantity: 0, unitPrice: 10 },
      ],
    }, cookie);

    expect(status).toBe(400);
    expect((data as { error?: string }).error).toBe(ZERO_VALID_LINE_ERROR);

    const detailAfter = await apiGet(`/api/purchase-orders/${seeded.id}/detail`, cookie) as {
      totalAmount?: string;
      notes?: string;
      items?: Array<unknown>;
    };
    expect(detailAfter.totalAmount).toBe(totalBefore);
    expect(detailAfter.items?.length).toBe(itemCountBefore);
    // Notes must NOT have been written — the header update happens
    // INSIDE the same transaction that we just rejected.
    expect(detailAfter.notes).toBe(notesBefore);
    expect(detailAfter.notes).not.toBe('RF-3 PUT zero-valid attempt');
  });
});
