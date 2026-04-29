/**
 * CSRF token interceptor (Task #374).
 *
 * Wraps `window.fetch` so EVERY mutating request to `/api/*` from the
 * client automatically carries an `X-CSRF-Token` header that pairs with
 * the server's double-submit cookie.
 *
 * This single interceptor covers all callsites — `apiRequest`, the
 * Base44 SDK shim in `client/src/api/entities.ts`, the dozens of raw
 * `fetch()` calls in components, and any future code that uses
 * `fetch()` directly. No per-component changes are required.
 *
 * Token lifecycle:
 *   - Lazily fetched from `GET /api/auth/csrf-token` on the first
 *     mutating request after page load.
 *   - Cached in module scope so subsequent mutations reuse it.
 *   - On a 403 with a CSRF-error body, the token is cleared and
 *     refetched, and the original request is retried exactly once.
 *
 * Skipped requests:
 *   - GET / HEAD / OPTIONS — never need a token.
 *   - Cross-origin requests — would leak the token.
 *   - `/api/auth/login` — server excludes it (chicken-and-egg).
 *   - `/api/auth/logout` — server excludes it (idempotent).
 *   - `/api/auth/csrf-token` itself — would loop.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const SKIP_PATHS = new Set<string>([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/csrf-token',
]);

const SIGNED_UPLOAD_PATH_REGEX = /^\/api\/storage\/upload\/[A-Za-z0-9]+$/;

let cachedToken: string | null = null;
let inflightFetch: Promise<string | null> | null = null;

const PATCHED_MARKER = Symbol.for('flow.csrf.patched');
type PatchedWindow = typeof window & { [PATCHED_MARKER]?: true };
const _w = window as PatchedWindow;
const _alreadyPatched = _w[PATCHED_MARKER] === true;
const originalFetch: typeof window.fetch = window.fetch.bind(window);

async function fetchToken(): Promise<string | null> {
  if (inflightFetch) return inflightFetch;
  inflightFetch = (async () => {
    try {
      const res = await originalFetch('/api/auth/csrf-token', {
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { csrfToken?: string };
      cachedToken = data.csrfToken ?? null;
      return cachedToken;
    } catch {
      return null;
    } finally {
      inflightFetch = null;
    }
  })();
  return inflightFetch;
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const fromInit = init?.method;
  if (fromInit) return fromInit.toUpperCase();
  if (typeof input === 'object' && 'method' in input && input.method) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

function resolveApiPath(input: RequestInfo | URL): string | null {
  let raw: string;
  if (typeof input === 'string') raw = input;
  else if (input instanceof URL) raw = input.toString();
  else raw = input.url;

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin !== window.location.origin) return null;
    if (!parsed.pathname.startsWith('/api/')) return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

async function isCsrfFailure(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const cloned = res.clone();
    const text = await cloned.text();
    return /csrf|invalid token/i.test(text);
  } catch {
    return false;
  }
}

if (!_alreadyPatched) {
  _w[PATCHED_MARKER] = true;
window.fetch = async function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = resolveMethod(input, init);
  if (!MUTATING_METHODS.has(method)) return originalFetch(input, init);

  const path = resolveApiPath(input);
  if (!path) return originalFetch(input, init);
  if (SKIP_PATHS.has(path)) return originalFetch(input, init);
  if (SIGNED_UPLOAD_PATH_REGEX.test(path)) return originalFetch(input, init);

  const baseInit: RequestInit = {
    ...(init ?? {}),
    credentials: init?.credentials ?? 'include',
  };

  let token = cachedToken ?? (await fetchToken());

  const send = async (): Promise<Response> => {
    const headers = new Headers(baseInit.headers);
    if (token) headers.set('X-CSRF-Token', token);
    return originalFetch(input, { ...baseInit, headers });
  };

  let res = await send();

  if (await isCsrfFailure(res)) {
    cachedToken = null;
    token = await fetchToken();
    if (token) res = await send();
  }

  return res;
};
}

export {};
