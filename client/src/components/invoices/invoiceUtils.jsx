import { isValid, parseISO } from "date-fns";

export const isOverdue = (invoice) => {
  const outstanding = (invoice.total_amount || 0) - (invoice.paid_amount || 0);
  if (outstanding <= 0.01) return false;

  if (!invoice.invoice_date) return false;

  try {
    const invoiceDate = new Date(invoice.invoice_date);
    if (!isValid(invoiceDate)) return false;

    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 30); // Assumes Net 30 payment terms
    
    return dueDate < new Date();
  } catch (error) {
    return false;
  }
};

export const getDerivedInvoiceStatus = (invoice) => {
  if (invoice.status === 'draft') {
    return 'draft';
  }

  const outstanding = (invoice.total_amount || 0) - (invoice.paid_amount || 0);
  if (outstanding <= 0.01 && invoice.total_amount > 0) {
    return 'paid';
  }

  if (isOverdue(invoice)) {
    return 'overdue';
  }

  return 'submitted';
};