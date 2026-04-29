/**
 * CSRF protection (Task #374) — server-side enforcement via the
 * double-submit cookie pattern (csrf-csrf v4).
 *
 * Architectural decisions:
 *   - Mounted at the APP ROOT (not under /api) in server/routes.ts so
 *     req.path retains its full pathname; mounting under a prefix would
 *     strip the prefix and break the skip-list checks below.
 *   - Cookie name `flow.x-csrf-token`, header `X-CSRF-Token`,
 *     sameSite=lax, httpOnly, secure-in-prod — matches the session
 *     cookie posture so behaviour is consistent across requests.
 *   - getSessionIdentifier = req.sessionID so each authenticated session
 *     has its own bound CSRF token; falls back to 'anonymous' for
 *     unauth requests, which will fail token validation anyway.
 *
 * Skip-list (deliberate exemptions):
 *   - Anything outside /api/ — Vite dev server, static assets, React SPA;
 *     none of these reach an Express handler we own.
 *   - /api/auth/login — chicken-and-egg: a fresh visitor has no session
 *     yet, so cannot have a paired CSRF token.
 *   - /api/auth/logout — idempotent, requires no body, low CSRF risk.
 *   - /api/storage/upload/:token — uses signed-token auth (NOT session
 *     auth), so the CSRF threat model does not apply. The signed token
 *     itself is unguessable and single-use, providing the equivalent of
 *     CSRF protection. External upload scripts (e.g. backup uploaders)
 *     intentionally hit this endpoint without a browser session.
 *
 * Adding a new public mutating route does NOT require any CSRF wiring —
 * the middleware covers everything by default. Skipping requires a
 * deliberate addition to SKIP_PATHS or SIGNED_UPLOAD_PATH_REGEX.
 */
import { doubleCsrf, type DoubleCsrfUtilities } from 'csrf-csrf';
import type { Request } from 'express';

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error('SESSION_SECRET environment variable is required for CSRF protection');
}

export const CSRF_COOKIE_NAME = 'flow.x-csrf-token';

const SIGNED_UPLOAD_PATH_REGEX = /^\/api\/storage\/upload\/[A-Za-z0-9]+$/;

const SKIP_PATHS = new Set<string>([
  '/api/auth/login',
  '/api/auth/logout',
]);

const csrfUtilities: DoubleCsrfUtilities = doubleCsrf({
  getSecret: () => sessionSecret,
  getSessionIdentifier: (req: Request) => {
    const sid = (req as Request & { sessionID?: string }).sessionID;
    return sid ?? 'anonymous';
  },
  cookieName: CSRF_COOKIE_NAME,
  cookieOptions: {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req: Request) => {
    const header = req.headers['x-csrf-token'];
    if (Array.isArray(header)) return header[0];
    return header;
  },
  skipCsrfProtection: (req: Request) => {
    // We mount this middleware at the app level (no prefix) so req.path is the
    // full pathname. Anything outside /api/ never reaches an Express handler
    // we own (Vite dev server, static assets, the React SPA), so skip it.
    if (!req.path.startsWith('/api/')) return true;
    if (SKIP_PATHS.has(req.path)) return true;
    if (SIGNED_UPLOAD_PATH_REGEX.test(req.path)) return true;
    return false;
  },
});

export const {
  doubleCsrfProtection,
  generateCsrfToken,
  invalidCsrfTokenError,
} = csrfUtilities;
