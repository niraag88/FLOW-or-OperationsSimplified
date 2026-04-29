import { test, expect } from '@playwright/test';
import {
  apiLogin,
  apiGet,
  apiPost,
  BASE_URL,
  toProductList,
  productStock,
  type ApiProduct,
} from './helpers';

/**
 * Task #364 (RF-6): Stop hard-deleting stock count records that have
 * already produced stock movements. A confirmed stock count writes
 * adjustment rows into stock_movements (referenceType='stock_count',
 * referenceId=<count id>); hard-deleting the count would orphan those
 * rows so the inventory history points at a count document that no
 * longer exists.
 *
 * Acceptance:
 *   - DELETE /api/stock-counts/:id returns 400 with the friendly
 *     "retained for audit" message when the count produced at least
 *     one stock movement. The count + items remain in the database.
 *   - DELETE on a count that produced no movements (e.g. counted
 *     quantity matched current stock so delta=0) still removes both
 *     rows as today.
 */
test.describe('Stock Count DELETE guard — confirmed counts retained for audit (Task #364, RF-6)', () => {
  let cookie: string;
  let target: ApiProduct;
  let originalStock: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const prods = toProductList(await apiGet('/api/products', cookie));
    test.skip(prods.length === 0, 'Requires at least one product in the database');
    target = prods[0];
    originalStock = productStock(target);
  });

  test('DELETE on a stock count that produced stock movements is rejected with 400', async () => {
    // Submit a count where the counted quantity differs from current
    // stock — this forces updateProductStock() to write a row into
    // stock_movements with referenceType='stock_count'.
    const items = [{
      product_id: target.id,
      product_code: target.sku ?? '',
      product_name: target.name,
      brand_name: '',
      size: '',
      quantity: originalStock + 1,
    }];
    const create = await apiPost('/api/stock-counts', { items }, cookie);
    expect(create.status).toBe(201);
    const id = (create.data as { id: number }).id;
    expect(id).toBeTruthy();

    const r = await fetch(`${BASE_URL}/api/stock-counts/${id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error?: string };
    expect(body.error).toMatch(/retained for audit/i);

    // The count + its items must still be present.
    const stillThere = (await apiGet(`/api/stock-counts/${id}`, cookie)) as {
      id?: number;
      items?: unknown[];
    };
    expect(stillThere.id).toBe(id);
    expect((stillThere.items ?? []).length).toBeGreaterThan(0);

    // Restore stock for downstream tests by submitting a compensating
    // count back to the original quantity. (This second count is also
    // movement-bearing and therefore also non-deletable, which is the
    // documented behaviour — we accept the test pollution to keep
    // unrelated specs' inventory expectations stable.)
    const restore = await apiPost(
      '/api/stock-counts',
      {
        items: [{
          product_id: target.id,
          product_code: target.sku ?? '',
          product_name: target.name,
          brand_name: '',
          size: '',
          quantity: originalStock,
        }],
      },
      cookie,
    );
    expect(restore.status).toBe(201);
  });

  test('DELETE on a stock count with no movements (counted matches current stock) still removes it', async () => {
    // Re-fetch to pick up any stock drift from the previous test.
    const prodsNow = toProductList(await apiGet('/api/products', cookie));
    const fresh = prodsNow.find((p) => p.id === target.id) ?? target;
    const stockNow = productStock(fresh);

    // Counted == current → delta=0 → no stock_movements row written.
    const items = [{
      product_id: fresh.id,
      product_code: fresh.sku ?? '',
      product_name: fresh.name,
      brand_name: '',
      size: '',
      quantity: stockNow,
    }];
    const create = await apiPost('/api/stock-counts', { items }, cookie);
    expect(create.status).toBe(201);
    const id = (create.data as { id: number }).id;
    expect(id).toBeTruthy();

    const r = await fetch(`${BASE_URL}/api/stock-counts/${id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { success?: boolean };
    expect(body.success).toBe(true);

    // The count is gone.
    const after = await fetch(`${BASE_URL}/api/stock-counts/${id}`, {
      headers: { Cookie: cookie },
    });
    expect(after.status).toBe(404);
  });

  test('stock-counts list endpoint still works (no regression)', async () => {
    const data = await apiGet('/api/stock-counts', cookie);
    expect(Array.isArray(data)).toBe(true);
  });
});
