
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Building, Save, PoundSterling } from "lucide-react"; // Added PoundSterling icon
import { CompanySettings } from "@/api/entities";
import { UploadFile } from "@/api/integrations";
import { useToast } from "@/components/ui/use-toast";

export default function CompanySettingsComponent() {
  const [settings, setSettings] = useState({
    company_name: "",
    company_logo_url: "",
    company_address: "",
    company_phone: "",
    company_email: "",
    company_trn: "", // Added company_trn
    tax_rate: 5.0,
    default_vat_rate: 0.05, // Added default_vat_rate
    default_currency: "AED",
    fx_gbp_to_aed: 4.85, // Added fx_gbp_to_aed
    po_number_prefix: "PO",
    do_number_prefix: "DO",
    invoice_number_prefix: "INV",
    grn_number_prefix: "GRN",
    next_po_number: 1,
    next_do_number: 1,
    next_invoice_number: 1,
    next_grn_number: 1
  });
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [trnError, setTrnError] = useState(""); // Added trnError state
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settingsList = await CompanySettings.list();
      if (settingsList.length > 0) {
        // Ensure default_vat_rate and fx_gbp_to_aed are set if not present in loaded settings
        const loadedSettings = settingsList[0];
        setSettings(prev => ({
          ...prev,
          ...loadedSettings,
          default_vat_rate: loadedSettings.default_vat_rate !== undefined ? loadedSettings.default_vat_rate : 0.05,
          fx_gbp_to_aed: loadedSettings.fx_gbp_to_aed !== undefined ? loadedSettings.fx_gbp_to_aed : 4.85
        }));
      }
    } catch (error) {
      console.error("Error loading company settings:", error);
    } finally {
      setInitialLoad(false);
    }
  };

  const validateTRN = (trn) => {
    if (!trn) return true; // TRN is optional, valid if empty
    
    // UAE TRN format: 15 digits, typically starts with 1
    const trnRegex = /^[0-9]{15}$/;
    return trnRegex.test(trn);
  };

  const handleInputChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));

    // Validate TRN on change
    if (field === 'company_trn') {
      if (value && !validateTRN(value)) {
        setTrnError("TRN must be exactly 15 digits");
      } else {
        setTrnError("");
      }
    }
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setLoading(true);
      const { file_url } = await UploadFile({ file });
      handleInputChange('company_logo_url', file_url);
      toast({
        title: "Logo uploaded successfully",
        description: "Company logo has been updated."
      });
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload company logo.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validate TRN before saving
    if (settings.company_trn && !validateTRN(settings.company_trn)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid 15-digit TRN",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const settingsList = await CompanySettings.list();
      if (settingsList.length > 0) {
        await CompanySettings.update(settingsList[0].id, settings);
      } else {
        await CompanySettings.create(settings);
      }
      
      toast({
        title: "Settings saved",
        description: "Company settings have been updated successfully."
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Save failed",
        description: "Failed to save company settings.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (initialLoad) {
    return <div>Loading...</div>;
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="w-5 h-5" />
          Company Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Company Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Company Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name *</Label>
              <Input
                id="company_name"
                value={settings.company_name}
                onChange={(e) => handleInputChange('company_name', e.target.value)}
                placeholder="Enter company name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_email">Company Email *</Label>
              <Input
                id="company_email"
                type="email"
                value={settings.company_email}
                onChange={(e) => handleInputChange('company_email', e.target.value)}
                placeholder="company@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_phone">Phone Number</Label>
              <Input
                id="company_phone"
                value={settings.company_phone}
                onChange={(e) => handleInputChange('company_phone', e.target.value)}
                placeholder="+971 XX XXX XXXX"
              />
            </div>
            
            {/* New TRN Field */}
            <div className="space-y-2">
              <Label htmlFor="company_trn">Tax Registration Number (TRN)</Label>
              <Input
                id="company_trn"
                value={settings.company_trn}
                onChange={(e) => handleInputChange('company_trn', e.target.value)}
                placeholder="100000000000000"
                maxLength={15}
                className={trnError ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {trnError && <p className="text-sm text-red-500">{trnError}</p>}
              <p className="text-xs text-gray-500">15-digit UAE Tax Registration Number</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="default_currency">Default Currency</Label>
              <Select
                value={settings.default_currency}
                onValueChange={(value) => handleInputChange('default_currency', value)}
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
            
            {/* New Default VAT Rate Field */}
            <div className="space-y-2">
              <Label htmlFor="default_vat_rate">Default VAT Rate (%)</Label>
              <Input
                id="default_vat_rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={(settings.default_vat_rate * 100).toFixed(2)}
                onChange={(e) => handleInputChange('default_vat_rate', parseFloat(e.target.value) / 100 || 0)}
              />
              <p className="text-xs text-gray-500">Used as default for new invoices</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_address">Address</Label>
            <Textarea
              id="company_address"
              value={settings.company_address}
              onChange={(e) => handleInputChange('company_address', e.target.value)}
              placeholder="Enter company address"
              rows={3}
            />
          </div>

          {/* Removed old tax_rate input as it's replaced by default_vat_rate visually */}
          {/*
          <div className="space-y-2">
            <Label htmlFor="tax_rate">Tax Rate (%)</Label>
            <Input
              id="tax_rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={settings.tax_rate}
              onChange={(e) => handleInputChange('tax_rate', parseFloat(e.target.value) || 0)}
            />
          </div>
          */}

          <div className="space-y-2">
            <Label>Company Logo</Label>
            <div className="flex items-center gap-4">
              {settings.company_logo_url && (
                <img
                  src={settings.company_logo_url}
                  alt="Company Logo"
                  className="w-16 h-16 object-contain border rounded"
                />
              )}
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  id="logo-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('logo-upload').click()}
                  disabled={loading}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {settings.company_logo_url ? 'Change Logo' : 'Upload Logo'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Settings */}
        <div className="space-y-4 pt-6 border-t">
          <h3 className="text-lg font-semibold">Financial Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
                <Label htmlFor="fx_gbp_to_aed">Exchange Rate (GBP to AED)</Label>
                <div className="relative">
                  <PoundSterling className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="fx_gbp_to_aed"
                    type="number"
                    step="0.01"
                    min="0"
                    value={settings.fx_gbp_to_aed}
                    onChange={(e) => handleInputChange('fx_gbp_to_aed', parseFloat(e.target.value) || 0)}
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-gray-500">1 GBP = {settings.fx_gbp_to_aed} AED</p>
            </div>
          </div>
        </div>

        {/* Document Numbering */}
        <div className="space-y-4 pt-6 border-t">
          <h3 className="text-lg font-semibold">Document Numbering</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="po_prefix">PO Prefix</Label>
              <Input
                id="po_prefix"
                value={settings.po_number_prefix}
                onChange={(e) => handleInputChange('po_number_prefix', e.target.value)}
                placeholder="PO"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="do_prefix">DO Prefix</Label>
              <Input
                id="do_prefix"
                value={settings.do_number_prefix}
                onChange={(e) => handleInputChange('do_number_prefix', e.target.value)}
                placeholder="DO"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="inv_prefix">Invoice Prefix</Label>
              <Input
                id="inv_prefix"
                value={settings.invoice_number_prefix}
                onChange={(e) => handleInputChange('invoice_number_prefix', e.target.value)}
                placeholder="INV"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="grn_prefix">GRN Prefix</Label>
              <Input
                id="grn_prefix"
                value={settings.grn_number_prefix}
                onChange={(e) => handleInputChange('grn_number_prefix', e.target.value)}
                placeholder="GRN"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="next_po">Next PO Number</Label>
              <Input
                id="next_po"
                type="number"
                min="1"
                value={settings.next_po_number}
                onChange={(e) => handleInputChange('next_po_number', parseInt(e.target.value) || 1)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="next_do">Next DO Number</Label>
              <Input
                id="next_do"
                type="number"
                min="1"
                value={settings.next_do_number}
                onChange={(e) => handleInputChange('next_do_number', parseInt(e.target.value) || 1)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="next_inv">Next Invoice Number</Label>
              <Input
                id="next_inv"
                type="number"
                min="1"
                value={settings.next_invoice_number}
                onChange={(e) => handleInputChange('next_invoice_number', parseInt(e.target.value) || 1)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="next_grn">Next GRN Number</Label>
              <Input
                id="next_grn"
                type="number"
                min="1"
                value={settings.next_grn_number}
                onChange={(e) => handleInputChange('next_grn_number', parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-6 border-t">
          <Button 
            onClick={handleSave} 
            disabled={loading || !!trnError} // Disabled if loading or TRN error exists
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {loading ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
