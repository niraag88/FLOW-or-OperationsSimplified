/**
 * Unit tests for the next-due computation used by the scheduled-backup
 * feature (Task #325).
 *
 * Run with:  npx tsx --test tests/unit/backupSchedule.test.ts
 *
 * Asia/Dubai is UTC+4 with no DST, so the math is simple:
 *   Dubai 09:00 = UTC 05:00, regardless of date.
 *
 * The computeNextDueAt() helper is pure and free of DB calls, so we
 * exercise it directly here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNextDueAt } from '../../server/backupSchedule';

// Fixed reference: 2026-01-15 02:00 UTC == 2026-01-15 06:00 Dubai
const REF_BEFORE = new Date('2026-01-15T02:00:00Z');
// 2026-01-15 09:00 UTC == 2026-01-15 13:00 Dubai
const REF_AFTER = new Date('2026-01-15T09:00:00Z');

test("daily: today's HH:MM has not yet happened → schedules for today", () => {
  // 09:00 Dubai == 05:00 UTC, ref is 02:00 UTC (still 06:00 Dubai)
  const r = computeNextDueAt('daily', '09:00', REF_BEFORE, 'first');
  assert.equal(r.toISOString(), '2026-01-15T05:00:00.000Z');
});

test("daily: today's HH:MM has already passed → schedules for tomorrow", () => {
  // 09:00 Dubai == 05:00 UTC, ref is 09:00 UTC (already 13:00 Dubai)
  const r = computeNextDueAt('daily', '09:00', REF_AFTER, 'first');
  assert.equal(r.toISOString(), '2026-01-16T05:00:00.000Z');
});

test("daily: midnight rollover (Dubai 23:30, ref just after) → next-day 23:30", () => {
  // 23:30 Dubai = 19:30 UTC; ref = 22:00 UTC (= 02:00 Dubai NEXT day)
  const ref = new Date('2026-01-15T22:00:00Z');
  const r = computeNextDueAt('daily', '23:30', ref, 'first');
  // Today (Jan 16 Dubai) at 23:30 = Jan 16 19:30 UTC
  assert.equal(r.toISOString(), '2026-01-16T19:30:00.000Z');
});

test("every_2_days: first occurrence at-or-after ref", () => {
  const r = computeNextDueAt('every_2_days', '09:00', REF_BEFORE, 'first');
  assert.equal(r.toISOString(), '2026-01-15T05:00:00.000Z');
});

test("every_2_days: 'next' mode advances by exactly 2 days", () => {
  const start = new Date('2026-01-15T05:00:00.000Z');
  const r = computeNextDueAt('every_2_days', '09:00', start, 'next');
  assert.equal(r.toISOString(), '2026-01-17T05:00:00.000Z');
});

test("weekly: 'next' mode advances by exactly 7 days", () => {
  const start = new Date('2026-01-15T05:00:00.000Z');
  const r = computeNextDueAt('weekly', '09:00', start, 'next');
  assert.equal(r.toISOString(), '2026-01-22T05:00:00.000Z');
});

test("daily: 'next' mode advances by exactly 1 day", () => {
  const start = new Date('2026-01-15T05:00:00.000Z');
  const r = computeNextDueAt('daily', '09:00', start, 'next');
  assert.equal(r.toISOString(), '2026-01-16T05:00:00.000Z');
});

test("daily: time at 00:00 Dubai (= 20:00 prev UTC day) before that hour", () => {
  // 00:00 Dubai = 20:00 UTC prev day. Reference: 18:00 UTC = 22:00 Dubai
  const ref = new Date('2026-01-14T18:00:00Z');
  const r = computeNextDueAt('daily', '00:00', ref, 'first');
  // Today in Dubai = Jan 14 (since it's still Jan 14 22:00 Dubai), so today's
  // 00:00 was Jan 13 20:00 UTC — already passed → tomorrow's 00:00 = Jan 14 20:00 UTC
  assert.equal(r.toISOString(), '2026-01-14T20:00:00.000Z');
});

test("invalid timeOfDay throws", () => {
  assert.throws(() => computeNextDueAt('daily', '99:99', REF_BEFORE, 'first'));
  assert.throws(() => computeNextDueAt('daily', '9:00', REF_BEFORE, 'first'));
  assert.throws(() => computeNextDueAt('daily', 'abcd', REF_BEFORE, 'first'));
});

// ── Regression: first-occurrence must not skip days based on frequency ──
//
// Earlier the loop in `mode='first'` advanced by `periodDays`, so when
// today's HH:MM had already passed it would push next-due forward by 7
// days for `weekly` (or 2 days for `every_2_days`) instead of
// "tomorrow at HH:MM". Frequency stepping should only apply on
// post-success advancement (mode='next').

test("weekly: today's HH:MM has passed → first occurrence is TOMORROW at HH:MM (not +7 days)", () => {
  // 09:00 Dubai = 05:00 UTC; ref is 09:00 UTC = 13:00 Dubai (already past 09:00)
  const r = computeNextDueAt('weekly', '09:00', REF_AFTER, 'first');
  // Tomorrow 05:00 UTC == Jan 16
  assert.equal(r.toISOString(), '2026-01-16T05:00:00.000Z');
});

test("every_2_days: today's HH:MM has passed → first occurrence is TOMORROW at HH:MM (not +2 days)", () => {
  const r = computeNextDueAt('every_2_days', '09:00', REF_AFTER, 'first');
  assert.equal(r.toISOString(), '2026-01-16T05:00:00.000Z');
});

test("weekly: today's HH:MM still upcoming → first occurrence is TODAY at HH:MM", () => {
  // ref is 02:00 UTC = 06:00 Dubai, target 09:00 Dubai still upcoming
  const r = computeNextDueAt('weekly', '09:00', REF_BEFORE, 'first');
  assert.equal(r.toISOString(), '2026-01-15T05:00:00.000Z');
});

// ── Failure-path semantic: only mode='next' advances by frequency ──
//
// The scheduler distinguishes attempt vs success: lastRunAt is bumped
// on every attempt, but nextDueAt only advances after a *successful*
// run via computeNextDueAt(..., 'next'). This pair of tests pins that
// contract by showing that the same "current" reference returns the
// upcoming today/tomorrow window in 'first' mode (used on save and
// implicitly during retry — nextDueAt is left alone) but a one-period
// later value in 'next' mode (used on success). A failed scheduler tick
// therefore retries the same window on the next minute.

test("scheduler retry contract: 'first' mode does NOT advance past the current window", () => {
  // 09:00 Dubai = 05:00 UTC. ref is 04:30 UTC = 08:30 Dubai (still upcoming today)
  const ref = new Date('2026-01-15T04:30:00Z');
  const first = computeNextDueAt('daily', '09:00', ref, 'first');
  assert.equal(first.toISOString(), '2026-01-15T05:00:00.000Z');
  // ...but 'next' from the same reference is one full period later.
  const next = computeNextDueAt('daily', '09:00', ref, 'next');
  assert.equal(next.toISOString(), '2026-01-16T05:00:00.000Z');
  assert.notEqual(first.toISOString(), next.toISOString());
});
