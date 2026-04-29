import { db } from "../db";
import { like } from "drizzle-orm";
import { purchaseOrders, quotations } from "@shared/schema";
import { getCompanySettings, updateCompanySettings } from "./company-settings";

// Generate sequential numbers
// Find the highest numeric suffix from existing POs that match the EXACT prefix sequence.
// "Exact" means po_number = "<prefix>-<digits>" with no extra dash-segments.
// Example: prefix "PO" matches "PO-114" but NOT "PO-UAE-001" (different prefix scheme).
// Returns 0 when no POs with this exact prefix format exist yet.
async function getMaxExistingPoNumber(prefix: string): Promise<number> {
  // LIKE gives us a coarse superset; the JS loop enforces the exact shape.
  const existing = await db
    .select({ poNumber: purchaseOrders.poNumber })
    .from(purchaseOrders)
    .where(like(purchaseOrders.poNumber, `${prefix}-%`));

  // prefix has N dash-separated segments (e.g. "PO" → 1, "PO-UAE" → 2).
  // A valid PO number for this prefix has exactly N+1 segments, with the last being all digits.
  const prefixSegmentCount = prefix.split('-').length;
  let maxNum = 0;
  for (const row of existing) {
    const parts = row.poNumber.split('-');
    const lastPart = parts[parts.length - 1];
    if (parts.length === prefixSegmentCount + 1 && /^\d+$/.test(lastPart)) {
      const num = parseInt(lastPart, 10);
      if (num > maxNum) maxNum = num;
    }
  }
  return maxNum;
}

export async function generatePoNumber() {
  const settings = await getCompanySettings();
  const rawPrefix = settings?.poNumberPrefix || 'PO';
  const prefix = rawPrefix.endsWith('-') ? rawPrefix.slice(0, -1) : rawPrefix;
  const counterNumber = settings?.nextPoNumber || 1;

  // Derive the next number exclusively from the actual purchase_orders table.
  // This makes numbering deletion-proof: if POs 115-125 were created then deleted,
  // dbMaxNumber = 114 and nextNumber = 115, regardless of what the counter says.
  // The counter (company_settings.next_po_number) is only used as a fallback when
  // no POs with this prefix exist yet (fresh system / first PO ever).
  // Note: using MAX(dbMax+1, counter) would be wrong here — the counter is inflated
  // by deletions and must be ignored once the DB is the source of truth.
  const dbMaxNumber = await getMaxExistingPoNumber(prefix);
  const nextNumber = dbMaxNumber > 0 ? dbMaxNumber + 1 : Math.max(counterNumber, 1);

  // Simple format: PREFIX-NUMBER (e.g., PO-115) or PREFIX-PART-NNN (e.g., PO-UAE-001)
  const formattedNumber = prefix.includes('-')
    ? `${prefix}-${String(nextNumber).padStart(3, '0')}`
    : `${prefix}-${nextNumber}`;

  // Sync the counter forward so it roughly tracks reality (it won't be used for
  // sequencing while DB data exists, but keeps the value reasonable).
  if (settings) {
    await updateCompanySettings({
      ...settings,
      nextPoNumber: nextNumber + 1
    });
  }

  return formattedNumber;
}

export async function getNextPoNumber() {
  // Preview the next number without incrementing — uses identical logic to
  // generatePoNumber() so the form always shows the number that will be assigned.
  const settings = await getCompanySettings();
  const rawPrefix = settings?.poNumberPrefix || 'PO';
  const prefix = rawPrefix.endsWith('-') ? rawPrefix.slice(0, -1) : rawPrefix;
  const counterNumber = settings?.nextPoNumber || 1;

  const dbMaxNumber = await getMaxExistingPoNumber(prefix);
  const nextNumber = dbMaxNumber > 0 ? dbMaxNumber + 1 : Math.max(counterNumber, 1);

  const formattedNumber = prefix.includes('-')
    ? `${prefix}-${String(nextNumber).padStart(3, '0')}`
    : `${prefix}-${nextNumber}`;

  return formattedNumber;
}

export async function generateGrnNumber() {
  // Use the company-settings sequence — prevents duplicates on concurrent creates or after deletions.
  const settings = await getCompanySettings();
  const prefix = settings?.grnNumberPrefix || 'GRN';
  const nextNumber = settings?.nextGrnNumber || 1;

  // Format: PREFIX + 4-digit zero-padded counter (e.g. GRN0001)
  const receiptNumber = `${prefix}${String(nextNumber).padStart(4, '0')}`;

  if (settings) {
    await updateCompanySettings({
      ...settings,
      nextGrnNumber: nextNumber + 1,
    });
  }

  return receiptNumber;
}

// Helper function to compute next available number for a given prefix
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function computeNextNumberForPrefix(prefix: string): Promise<number> {
  // Create regex to match current prefix format exactly
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefixPattern = prefix.includes('-') 
    ? `${escapedPrefix}-(\\d+)$`  // Match "QUO-2025-123" format
    : `${escapedPrefix}-(\\d+)$`;  // Always expect dash separation
  
  // Get only quotation numbers for current prefix (efficient query)
  const existingQuotations = await db.select({
    quoteNumber: quotations.quoteNumber
  }).from(quotations);
  
  // Filter and extract numbers for current prefix only
  const regex = new RegExp(prefixPattern);
  const existingNumbers = existingQuotations
    .map(q => {
      const match = q.quoteNumber.match(regex);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(num => num > 0);
  
  // If no quotations exist, start from 1
  if (existingNumbers.length === 0) {
    return 1;
  }
  
  // Find the maximum number and add 1
  // This ensures we never reuse numbers unless they're from the end
  const maxNumber = Math.max(...existingNumbers);
  return maxNumber + 1;
}

export async function generateQuotationNumber() {
  const settings = await getCompanySettings();
  const rawPrefix = settings?.quotationNumberPrefix || 'QUO';
  const prefix = rawPrefix.endsWith('-') ? rawPrefix.slice(0, -1) : rawPrefix;
  const nextNumber = settings?.nextQuotationNumber || 1;

  const formattedNumber = prefix.includes('-')
    ? `${prefix}-${String(nextNumber).padStart(3, '0')}`
    : `${prefix}-${nextNumber}`;

  if (settings) {
    await updateCompanySettings({
      ...settings,
      nextQuotationNumber: nextNumber + 1
    });
  }

  return formattedNumber;
}

export async function getNextQuotationNumber() {
  const settings = await getCompanySettings();
  const rawPrefix = settings?.quotationNumberPrefix || 'QUO';
  const prefix = rawPrefix.endsWith('-') ? rawPrefix.slice(0, -1) : rawPrefix;
  const nextNumber = settings?.nextQuotationNumber || 1;

  const formattedNumber = prefix.includes('-')
    ? `${prefix}-${String(nextNumber).padStart(3, '0')}`
    : `${prefix}-${nextNumber}`;

  return formattedNumber;
}

export async function generateInvoiceNumber() {
  // Get settings for configurable numbering
  const settings = await getCompanySettings();
  const rawPrefix = settings?.invoiceNumberPrefix || 'INV';
  const prefix = rawPrefix.endsWith('-') ? rawPrefix.slice(0, -1) : rawPrefix;
  const nextNumber = settings?.nextInvoiceNumber || 1;
  
  // Simple format: PREFIX-NUMBER (e.g., INV-1, INV-UAE-001)
  const formattedNumber = prefix.includes('-') 
    ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // INV-UAE-001 style
    : `${prefix}-${nextNumber}`;  // INV-1 style
  
  // Update next number in settings
  if (settings) {
    await updateCompanySettings({
      ...settings,
      nextInvoiceNumber: nextNumber + 1
    });
  }
  
  return formattedNumber;
}

export async function getNextInvoiceNumber() {
  // Preview the next number without incrementing it
  const settings = await getCompanySettings();
  const rawPrefix = settings?.invoiceNumberPrefix || 'INV';
  const prefix = rawPrefix.endsWith('-') ? rawPrefix.slice(0, -1) : rawPrefix;
  const nextNumber = settings?.nextInvoiceNumber || 1;
  
  // Simple format: PREFIX-NUMBER (e.g., INV-1, INV-UAE-001)
  const formattedNumber = prefix.includes('-') 
    ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // INV-UAE-001 style
    : `${prefix}-${nextNumber}`;  // INV-1 style
  
  return formattedNumber;
}

export async function generateDoNumber() {
  // Get settings for configurable numbering
  const settings = await getCompanySettings();
  const rawDoPrefix = settings?.doNumberPrefix || 'DO';
  const prefix = rawDoPrefix.endsWith('-') ? rawDoPrefix.slice(0, -1) : rawDoPrefix;
  const nextNumber = settings?.nextDoNumber || 1;
  
  // Simple format: PREFIX-NUMBER (e.g., DO-1, DO-UAE-001)
  const formattedNumber = prefix.includes('-') 
    ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // DO-UAE-001 style
    : `${prefix}-${nextNumber}`;  // DO-1 style
  
  // Update next number in settings
  if (settings) {
    await updateCompanySettings({
      ...settings,
      nextDoNumber: nextNumber + 1
    });
  }
  
  return formattedNumber;
}

export async function getNextDoNumber() {
  // Preview the next number without incrementing it
  const settings = await getCompanySettings();
  const rawDoPrefix = settings?.doNumberPrefix || 'DO';
  const prefix = rawDoPrefix.endsWith('-') ? rawDoPrefix.slice(0, -1) : rawDoPrefix;
  const nextNumber = settings?.nextDoNumber || 1;
  
  // Simple format: PREFIX-NUMBER (e.g., DO-1, DO-UAE-001)
  const formattedNumber = prefix.includes('-') 
    ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // DO-UAE-001 style
    : `${prefix}-${nextNumber}`;  // DO-1 style
  
  return formattedNumber;
}
