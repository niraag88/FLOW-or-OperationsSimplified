import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, rawFetch } from './helpers';

/**
 * Regression test for Task #374 — CSRF protection.
 *
 * Mutating requests to `/api/*` MUST be rejected with 403 unless the caller
 * presents both:
 *   - the `X-CSRF-Token` header
 *   - the matching CSRF cookie (paired double-submit value)
 *
 * The two excluded endpoints (login, logout) must remain reachable without
 * a token so the auth handshake itself still works.
 */

test.describe('CSRF protection', () => {
  test('mutation without CSRF token returns 403', async () => {
    const sessionCookie = await apiLogin();
    expect(sessionCookie).not.toEqual('');

    // Hit a known PUT route with the session cookie but NO csrf header / cookie.
    // We use /api/customers (PUT requires Admin/Manager/Staff per the role
    // matrix, so any authenticated session is past the auth gate). The CSRF
    // middleware runs BEFORE the route handler, so this should 403 before any
    // body validation or DB lookup. We use rawFetch to bypass the test
    // helper's auto-attach interceptor.
    const res = await rawFetch(`${BASE_URL}/api/customers/999999`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({ name: 'X' }),
    });
    expect(res.status).toBe(403);
    const body = await res.text();
    expect(body.toLowerCase()).toMatch(/csrf|invalid token/);
  });

  test('login is exempt from CSRF (no token needed)', async () => {
    // apiLogin() does a raw POST without any csrf header — it must succeed.
    const sessionCookie = await apiLogin();
    expect(sessionCookie).not.toEqual('');
  });

  test('logout is exempt from CSRF (no token needed)', async () => {
    const sessionCookie = await apiLogin();
    const res = await rawFetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    expect(res.status).toBe(200);
  });

  test('GET requests are not subject to CSRF', async () => {
    const sessionCookie = await apiLogin();
    const res = await rawFetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: sessionCookie },
    });
    expect(res.status).toBe(200);
  });

  test('mutation with valid CSRF token + cookie is accepted', async () => {
    const sessionCookie = await apiLogin();

    // Fetch a token (also sets the paired cookie on the response).
    const tokenRes = await rawFetch(`${BASE_URL}/api/auth/csrf-token`, {
      headers: { Cookie: sessionCookie },
    });
    expect(tokenRes.status).toBe(200);
    const { csrfToken } = (await tokenRes.json()) as { csrfToken: string };
    expect(csrfToken).toBeTruthy();

    const setCookies =
      typeof (tokenRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie ===
      'function'
        ? (tokenRes.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : [tokenRes.headers.get('set-cookie') ?? ''];
    const csrfCookie =
      setCookies
        .map((sc) => sc.split(';')[0].trim())
        .find((p) => p.startsWith('flow.x-csrf-token=')) ?? '';
    expect(csrfCookie).toContain('flow.x-csrf-token=');

    // PUT a customer that doesn't exist — the CSRF gate should pass and we
    // should get a 404 from the route handler (NOT a 403 from CSRF).
    const res = await rawFetch(`${BASE_URL}/api/customers/999999`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${sessionCookie}; ${csrfCookie}`,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ name: 'CSRF Smoke Test' }),
    });
    expect(res.status).not.toBe(403);
  });

  test('CSRF gate is route-agnostic — applies to POST/DELETE on unrelated routes', async () => {
    // Demonstrates the protection is enforced uniformly across mutating
    // /api/* routes (not just the single PUT exercised above). We use
    // POST /api/brands and DELETE /api/products as two unrelated routes.
    const sessionCookie = await apiLogin();

    // POST without CSRF → 403
    const postNoCsrf = await rawFetch(`${BASE_URL}/api/brands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
      body: JSON.stringify({ name: 'Route Agnostic Brand' }),
    });
    expect(postNoCsrf.status).toBe(403);

    // DELETE without CSRF → 403
    const delNoCsrf = await rawFetch(`${BASE_URL}/api/products/999999`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookie },
    });
    expect(delNoCsrf.status).toBe(403);
  });
});
