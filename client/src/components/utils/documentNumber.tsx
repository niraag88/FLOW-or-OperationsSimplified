import { CompanySettings } from "@/api/entities";

export const generateDocumentNumber = async (type: any) => {
  try {
    const settingsList = await CompanySettings.list();
    let settings: any = settingsList[0];
    
    if (!settings) {
      // Create default settings if none exist
      settings = await CompanySettings.create({
        company_name: "Your Company",
        tax_rate: 5.0,
        default_currency: "AED",
        po_number_prefix: "PO",
        do_number_prefix: "DO", 
        invoice_number_prefix: "INV",
        grn_number_prefix: "GRN",
        next_po_number: 1,
        next_do_number: 1,
        next_invoice_number: 1,
        next_grn_number: 1
      });
    }

    const year = new Date().getFullYear();
    let prefix, nextNumber, updateField;

    switch (type) {
      case 'po':
        prefix = settings.po_number_prefix || 'PO';
        nextNumber = settings.next_po_number || 1;
        updateField = 'next_po_number';
        break;
      case 'do':
        prefix = settings.do_number_prefix || 'DO';
        nextNumber = settings.next_do_number || 1;
        updateField = 'next_do_number';
        break;
      case 'invoice':
        prefix = settings.invoice_number_prefix || 'INV';
        nextNumber = settings.next_invoice_number || 1;
        updateField = 'next_invoice_number';
        break;
      case 'grn':
        prefix = settings.grn_number_prefix || 'GRN';
        nextNumber = settings.next_grn_number || 1;
        updateField = 'next_grn_number';
        break;
      default:
        throw new Error('Invalid document type');
    }

    const documentNumber = `${prefix}-${year}-${nextNumber.toString().padStart(4, '0')}`;
    
    // Update the next number
    const updateData = { [updateField]: nextNumber + 1 };
    await CompanySettings.update(settings.id, updateData);
    
    return documentNumber;
  } catch (error: any) {
    console.error('Error generating document number:', error);
    // Fallback to timestamp-based number
    const timestamp = Date.now().toString().slice(-6);
    return `${type.toUpperCase()}-${timestamp}`;
  }
};