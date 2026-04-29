/**
 * shared/factoryResetPhrase.ts
 *
 * The single source of truth for the factory-reset confirmation phrase.
 * Lives in `shared/` so both the React client and the Express server can
 * import it without pulling in server-only dependencies (e.g. `pg`).
 *
 * See `server/factoryReset.ts` for the four-wall defence design.
 */
export const FACTORY_RESET_CONFIRMATION_PHRASE =
  'FACTORY RESET — I UNDERSTAND THIS DELETES EVERYTHING';
