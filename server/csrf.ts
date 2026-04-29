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
