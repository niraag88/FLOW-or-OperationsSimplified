/**
 * server/typedConfirmation.ts
 *
 * Reusable phrase-checking guard for destructive admin endpoints (Task #337).
 *
 * Generalises the Wall-1 idea introduced for factory reset (Task #331,
 * `server/factoryReset.ts`) so every destructive admin action shares the
 * same enforcement helper:
 *
 *   1. The route handler reads the JSON body.
 *   2. The route calls `assertConfirmationPhrase(body, EXPECTED_PHRASE,
 *      ERROR_CODE, ACTION_NAME)` BEFORE any write.
 *   3. If the body is missing or the phrase does not match exactly, the
 *      helper throws `TypedConfirmationError`. The route handler catches
 *      it and returns 400 with the stable error code. The expected phrase
 *      is NEVER echoed back so a script cannot recover it from error
 *      responses.
 *   4. If the phrase matches, the route proceeds with its existing role
 *      gate and business logic.
 *
 * This helper is intentionally tiny and dependency-free so any route
 * handler can use it with zero ceremony. The phrase constants live in
 * `shared/destructiveActionPhrases.ts` so the React client and the server
 * import the same value.
 *
 * Factory reset itself does NOT use this helper — it has its own
 * `FactoryResetConfirmationError` (Task #331) because it is wrapped by a
 * larger `executeFactoryReset()` transaction. The behaviour is identical
 * in spirit; this helper exists for the simpler endpoints that do not
 * need their own dedicated module.
 */

export class TypedConfirmationError extends Error {
  readonly code: string;
  readonly httpStatus = 400;

  constructor(code: string, actionName: string) {
    super(
      `${actionName} refused: the request body must include the exact ` +
        'confirmation phrase shown in the dialog. This is a deliberate ' +
        'guard against accidental data loss.',
    );
    this.code = code;
    this.name = 'TypedConfirmationError';
  }
}

/**
 * Throws `TypedConfirmationError` unless `body.confirmation` is a string
 * that is exactly equal to `expected`. No trimming, no case-folding, no
 * unicode normalization — equality is byte-for-byte intentional so that
 * a stray space or capital letter cannot wave the request through.
 */
export function assertConfirmationPhrase(
  body: unknown,
  expected: string,
  errorCode: string,
  actionName: string,
): void {
  const confirmation =
    body && typeof body === 'object' && 'confirmation' in body
      ? (body as { confirmation: unknown }).confirmation
      : undefined;

  if (typeof confirmation !== 'string' || confirmation !== expected) {
    throw new TypedConfirmationError(errorCode, actionName);
  }
}

/**
 * Convenience wrapper for Express route handlers. If the phrase is
 * missing/wrong, sends the canonical 400 response and returns `false` so
 * the handler can `if (!sendIfMissingConfirmation(...)) return;`. If the
 * phrase matches, returns `true`.
 *
 * The response body deliberately does NOT include the expected phrase.
 */
export function sendIfMissingConfirmation(
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  body: unknown,
  expected: string,
  errorCode: string,
  actionName: string,
): boolean {
  try {
    assertConfirmationPhrase(body, expected, errorCode, actionName);
    return true;
  } catch (err) {
    if (err instanceof TypedConfirmationError) {
      res.status(err.httpStatus).json({
        error: err.code,
        message: err.message,
      });
      return false;
    }
    throw err;
  }
}
