// Reusable typed-confirmation guard for destructive admin endpoints.
// The phrase constants live in shared/destructiveActionPhrases.ts so the
// React client and the server import the same value. Factory reset has
// its own dedicated FactoryResetConfirmationError because it is wrapped
// in a larger transaction.

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

// Throws TypedConfirmationError unless body.confirmation is a string
// exactly equal to expected. No trim, no case-fold, no normalization.
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

// Express convenience wrapper. Returns false (and sends the 400) if the
// phrase is missing/wrong; returns true if it matches. The expected
// phrase is never echoed in the response body.
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
