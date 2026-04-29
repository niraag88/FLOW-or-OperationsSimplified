/**
 * Unit tests for the escapeHtml helper and its application inside the
 * server-side DO PDF generator (Task #373).
 *
 * The DO PDF route uses puppeteer to render generateDOPDF()'s HTML output
 * to a binary PDF. Asserting "escaped entities" against the binary PDF is
 * meaningless because the PDF rendering pipeline decodes entities back to
 * their visual glyphs (`&amp;` → `&` in the rendered text). The right
 * place to assert the escape contract is on the HTML template stage,
 * BEFORE puppeteer rasterises it — which is what this suite does.
 *
 * Run with:  npx tsx --test tests/unit/escapeHtmlPdf.test.ts
 *
 * No DATABASE_URL needed: the tests import escapeHtml + generateDOPDF
 * directly from the side-effect-free server/lib/pdfTemplates module
 * and call them with hand-built fixture objects. The suite exits
 * cleanly without --test-force-exit.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, generateDOPDF } from '../../server/lib/pdfTemplates';

// ── escapeHtml: the helper itself ────────────────────────────────────────────

test('escapeHtml: maps all five HTML metacharacters to entities', () => {
  assert.equal(escapeHtml('&'), '&amp;');
  assert.equal(escapeHtml('<'), '&lt;');
  assert.equal(escapeHtml('>'), '&gt;');
  assert.equal(escapeHtml('"'), '&quot;');
  assert.equal(escapeHtml("'"), '&#39;');
});

test('escapeHtml: escapes & first so subsequent entities are not double-escaped', () => {
  // If & were escaped after < then the < entity (&lt;) would become &amp;lt;.
  assert.equal(escapeHtml('<&>'), '&lt;&amp;&gt;');
  assert.equal(escapeHtml('Acme & Co <Ltd>'), 'Acme &amp; Co &lt;Ltd&gt;');
});

test('escapeHtml: returns empty string for null and undefined', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml: coerces non-strings via String()', () => {
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeHtml(true), 'true');
  assert.equal(escapeHtml(false), 'false');
});

test('escapeHtml: a payload with no metacharacters round-trips unchanged', () => {
  assert.equal(escapeHtml('Plain text 123'), 'Plain text 123');
});

test('escapeHtml: realistic injection payloads are neutralised', () => {
  assert.equal(
    escapeHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;',
  );
  assert.equal(
    escapeHtml('</td><td>EXTRA'),
    '&lt;/td&gt;&lt;td&gt;EXTRA',
  );
  assert.equal(
    escapeHtml('" onload="alert(1)'),
    '&quot; onload=&quot;alert(1)',
  );
});

// ── generateDOPDF: applied at every interpolation point ──────────────────────

const CRAFTED = {
  customerName: 'Acme & Co <Ltd>',
  deliveryAddress: 'Building 1, Street 2 <br> Dubai',
  reference: 'REF-"123"',
  status: '<draft>',
  notes: '</td><td>EXTRA<script>alert(1)</script>',
  orderNumber: 'DO-001<&>',
  orderDate: '2026-04-29',
  subtotal: '100.00',
  taxAmount: '5.00',
  totalAmount: '105.00',
  currency: 'AED',
};

const CRAFTED_ITEMS = [
  {
    productCode: 'SKU-<X>&Y',
    description: '</td><td>INJECTED',
    quantity: 1,
    unitPrice: '100.00',
    lineTotal: '100.00',
  },
];

const CRAFTED_COMPANY = {
  name: 'My & Co <"test">',
  address: 'Office <100>',
  phone: '+971 "555"',
  email: 'test&user@example.com',
};

test('generateDOPDF: customer name with HTML metacharacters is escaped', async () => {
  const html = await generateDOPDF(CRAFTED, CRAFTED_ITEMS, CRAFTED_COMPANY);
  assert.match(html, /Acme &amp; Co &lt;Ltd&gt;/);
  assert.doesNotMatch(html, /Acme & Co <Ltd>/);
});

test('generateDOPDF: notes field escapes a script-injection payload', async () => {
  const html = await generateDOPDF(CRAFTED, CRAFTED_ITEMS, CRAFTED_COMPANY);
  // Raw <script> must NOT appear in the template.
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  // The escaped form must appear instead.
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('generateDOPDF: notes field cannot inject extra table cells', async () => {
  const html = await generateDOPDF(CRAFTED, CRAFTED_ITEMS, CRAFTED_COMPANY);
  // The crafted notes contain "</td><td>EXTRA" — must be escaped.
  assert.match(html, /&lt;\/td&gt;&lt;td&gt;EXTRA/);
});

test('generateDOPDF: item description cannot break out of its <td>', async () => {
  const html = await generateDOPDF(CRAFTED, CRAFTED_ITEMS, CRAFTED_COMPANY);
  // Item description "</td><td>INJECTED" must appear escaped.
  assert.match(html, /&lt;\/td&gt;&lt;td&gt;INJECTED/);
  // And there is exactly ONE injected-keyword cell, not two (crafted) + the
  // legitimate row would otherwise produce a second adjacent <td>INJECTED.
  const matches = html.match(/INJECTED/g) ?? [];
  assert.equal(matches.length, 1, 'INJECTED must appear exactly once');
});

test('generateDOPDF: product code with metacharacters is escaped', async () => {
  const html = await generateDOPDF(CRAFTED, CRAFTED_ITEMS, CRAFTED_COMPANY);
  assert.match(html, /SKU-&lt;X&gt;&amp;Y/);
});

test('generateDOPDF: reference, status, orderNumber are escaped', async () => {
  const html = await generateDOPDF(CRAFTED, CRAFTED_ITEMS, CRAFTED_COMPANY);
  assert.match(html, /REF-&quot;123&quot;/);
  assert.match(html, /&lt;draft&gt;/);
  assert.match(html, /DO-001&lt;&amp;&gt;/);
});

test('generateDOPDF: company name / address / phone / email are escaped', async () => {
  const html = await generateDOPDF(CRAFTED, CRAFTED_ITEMS, CRAFTED_COMPANY);
  assert.match(html, /My &amp; Co &lt;&quot;test&quot;&gt;/);
  assert.match(html, /Office &lt;100&gt;/);
  assert.match(html, /\+971 &quot;555&quot;/);
  assert.match(html, /test&amp;user@example\.com/);
});

test('generateDOPDF: delivery address with <br> tag is escaped (not rendered)', async () => {
  const html = await generateDOPDF(CRAFTED, CRAFTED_ITEMS, CRAFTED_COMPANY);
  // The address contains a literal "<br>" that the user typed — it must
  // appear as text, not as an HTML line break.
  assert.match(html, /Building 1, Street 2 &lt;br&gt; Dubai/);
});

test('generateDOPDF: nullable item fields fall back to "-" without crashing', async () => {
  const html = await generateDOPDF(
    CRAFTED,
    [
      {
        productCode: null,
        description: null,
        quantity: 1,
        unitPrice: '0',
        lineTotal: '0',
      },
    ],
    CRAFTED_COMPANY,
  );
  // The `${escapeHtml(x) || '-'}` pattern must still produce '-' when x is null.
  // Two nullable cells appear in the row.
  assert.match(html, /<td>-<\/td>\s*<td>-<\/td>/);
});

test('generateDOPDF: a sanitised payload still contains no bare < or > in user fields', async () => {
  const html = await generateDOPDF(CRAFTED, CRAFTED_ITEMS, CRAFTED_COMPANY);
  // None of the crafted strings should appear unescaped anywhere.
  for (const raw of [
    'Acme & Co <Ltd>',
    '<script>alert(1)</script>',
    '</td><td>EXTRA',
    '</td><td>INJECTED',
    'SKU-<X>&Y',
    'REF-"123"',
    '<draft>',
    'DO-001<&>',
    'My & Co <"test">',
    'Office <100>',
  ]) {
    assert.equal(
      html.includes(raw),
      false,
      `raw payload "${raw}" must NOT appear unescaped in the template`,
    );
  }
});
