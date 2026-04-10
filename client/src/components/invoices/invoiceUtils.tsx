export const getDerivedInvoiceStatus = (invoice: any) => {
  if (invoice.status === 'draft') {
    return 'draft';
  }

  const outstanding = (invoice.total_amount || 0) - (invoice.paid_amount || 0);
  if (outstanding <= 0.01 && invoice.total_amount > 0) {
    return 'paid';
  }

  return 'submitted';
};