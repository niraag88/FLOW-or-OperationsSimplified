import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Customer } from "@/api/entities";
import { logAuditAction } from "../utils/auditLogger";

// ISO 3166-1 alpha-2 country codes (common ones)
const COUNTRIES = [
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'IN', name: 'India' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'PH', name: 'Philippines' },
  { code: 'EG', name: 'Egypt' },
  { code: 'JO', name: 'Jordan' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'QA', name: 'Qatar' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'OM', name: 'Oman' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'CN', name: 'China' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' }
].sort((a, b) => a.name.localeCompare(b.name));

export default function CustomerForm({ open, onClose, editingCustomer, currentUser, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "",
    country_code: "",
    vat_number: "",
    vat_treatment_default: "", // Empty string means "automatic from country"
    currency: "AED",
    credit_limit: 0,
    payment_terms: "",
    isActive: true
  });

  useEffect(() => {
    if (editingCustomer) {
      setFormData({
        ...editingCustomer,
        vat_treatment_default: editingCustomer.vat_treatment_default || "", // Convert null to empty string for UI
        credit_limit: editingCustomer.credit_limit || 0
      });
    } else {
      setFormData({
        name: "",
        contact_person: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        country: "",
        country_code: "",
        vat_number: "",
        vat_treatment_default: "",
        currency: "AED",
        credit_limit: 0,
        payment_terms: "",
        is_active: true
      });
    }
  }, [editingCustomer, open]);

  const handleCountryChange = (countryCode) => {
    const country = COUNTRIES.find(c => c.code === countryCode);
    setFormData(prev => ({
      ...prev,
      country_code: countryCode,
      country: country?.name || ""
    }));
  };

  const getVatTreatmentDisplay = () => {
    if (!formData.vat_treatment_default) {
      // Show what "automatic" would mean
      const isUAE = formData.country_code === 'AE';
      return `Automatic from country (${isUAE ? 'Standard-rated' : 'Zero-rated'})`;
    }
    
    switch (formData.vat_treatment_default) {
      case 'StandardRated': return 'Standard-rated (VAT applies)';
      case 'ZeroRated': return 'Zero-rated';
      case 'Exempt': return 'Exempt';
      case 'OutOfScope': return 'Out of scope';
      default: return 'Automatic from country';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const customerData = {
        ...formData,
        vat_treatment_default: formData.vat_treatment_default || null, // Convert empty string back to null
        credit_limit: parseFloat(formData.credit_limit) || 0
      };

      if (editingCustomer) {
        // Check for VAT treatment changes for audit
        const oldVatTreatment = editingCustomer.vat_treatment_default;
        const newVatTreatment = customerData.vat_treatment_default;
        
        await Customer.update(editingCustomer.id, customerData);
        
        if (oldVatTreatment !== newVatTreatment) {
          await logAuditAction("Customer", editingCustomer.id, "vat_treatment_change", currentUser.email, {
            vat_treatment_default: {
              from: oldVatTreatment,
              to: newVatTreatment
            }
          });
        }
      } else {
        const newCustomer = await Customer.create(customerData);
        await logAuditAction("Customer", newCustomer.id, "create", currentUser.email, {
          name: customerData.name,
          country_code: customerData.country_code,
          vat_treatment_default: customerData.vat_treatment_default
        });
      }
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error saving customer:", error);
    } finally {
      setLoading(false);
    }
  };

  const canEdit = currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Ops');
  const isEditable = canEdit;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingCustomer ? `Edit Customer ${editingCustomer.name}` : 'New Customer'}
          </DialogTitle>
          <DialogDescription>
            {editingCustomer ? 'Update customer information' : 'Add a new customer'}
            {!isEditable && <p className="text-red-500 mt-2">You do not have permission to edit customers.</p>}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Basic Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Company Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  disabled={!isEditable}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="contact_person">Contact Person</Label>
                <Input
                  id="contact_person"
                  value={formData.contact_person}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
                  disabled={!isEditable}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  disabled={!isEditable}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  disabled={!isEditable}
                />
              </div>
            </div>
          </div>

          {/* Address Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Address</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country_code">Country *</Label>
                <Select 
                  value={formData.country_code} 
                  onValueChange={handleCountryChange}
                  disabled={!isEditable}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(country => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name} ({country.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  disabled={!isEditable}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                disabled={!isEditable}
                rows={2}
              />
            </div>
          </div>

          {/* Tax & Currency */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Tax & Currency</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vat_number">VAT/TRN Number</Label>
                <Input
                  id="vat_number"
                  value={formData.vat_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, vat_number: e.target.value }))}
                  disabled={!isEditable}
                  placeholder="100000000000000"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="currency">Default Currency</Label>
                <Select 
                  value={formData.currency} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}
                  disabled={!isEditable}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vat_treatment_default">VAT Treatment Default</Label>
              <Select 
                value={formData.vat_treatment_default} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, vat_treatment_default: value }))}
                disabled={!isEditable}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Automatic from country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Automatic from country</SelectItem>
                  <SelectItem value="StandardRated">Standard-rated (VAT applies)</SelectItem>
                  <SelectItem value="ZeroRated">Zero-rated</SelectItem>
                  <SelectItem value="Exempt">Exempt</SelectItem>
                  <SelectItem value="OutOfScope">Out of scope</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Determines VAT applicability when creating invoices for this customer. Can be overridden per invoice.
              </p>
              {formData.country_code && (
                <p className="text-xs text-blue-600">
                  Current: {getVatTreatmentDisplay()}
                </p>
              )}
            </div>
          </div>

          {/* Business Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Business Settings</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="credit_limit">Credit Limit</Label>
                <Input
                  id="credit_limit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.credit_limit}
                  onChange={(e) => setFormData(prev => ({ ...prev, credit_limit: e.target.value }))}
                  disabled={!isEditable}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="payment_terms">Payment Terms</Label>
                <Input
                  id="payment_terms"
                  value={formData.payment_terms}
                  onChange={(e) => setFormData(prev => ({ ...prev, payment_terms: e.target.value }))}
                  disabled={!isEditable}
                  placeholder="Net 30"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                disabled={!isEditable}
              />
              <Label htmlFor="isActive">Active Customer</Label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            {isEditable && (
              <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                {loading ? "Saving..." : editingCustomer ? "Update Customer" : "Create Customer"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}