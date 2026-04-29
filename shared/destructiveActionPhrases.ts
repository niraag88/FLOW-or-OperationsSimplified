// Single source of truth for typed-confirmation phrases used by every
// destructive admin action. Imported by both client and server so they
// always agree on the exact byte-for-byte phrase.

export { FACTORY_RESET_CONFIRMATION_PHRASE } from './factoryResetPhrase';

export const RECYCLE_BIN_PERMANENT_DELETE_PHRASE = 'PERMANENTLY DELETE';
export const USER_DELETE_PHRASE = 'DELETE USER';
export const RETENTION_PURGE_PHRASE = 'PURGE OLD DATA';
export const RESTORE_PHRASE = 'EMERGENCY RESTORE';
