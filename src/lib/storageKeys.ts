/**
 * Storage key generation utilities for PDF document storage
 */

/**
 * Generate storage key for invoice PDF scans
 * @param year - Invoice year
 * @param invoiceNo - Invoice number
 * @returns Storage key in format: invoices/YYYY/invoice-number.pdf
 */
export function invoicePdfKey(year: number, invoiceNo: string): string {
  return `invoices/${year}/${invoiceNo}.pdf`;
}

/**
 * Generate storage key for delivery order PDF scans
 * @param year - Delivery order year
 * @param doNo - Delivery order number
 * @returns Storage key in format: delivery/YYYY/do-number.pdf
 */
export function doPdfKey(year: number, doNo: string): string {
  return `delivery/${year}/${doNo}.pdf`;
}