
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Building, Save, PoundSterling, DollarSign, Edit2, X } from "lucide-react";
import { CompanySettings } from "@/api/entities";
import { UploadFile } from "@/api/integrations";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";

export default function CompanySettingsComponent() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole(['Admin']);

  const [settings, setSettings] = useState({
    companyName: "",
    logo: "", // Changed from company_logo_url to match schema
    address: "", // Changed from company_address to match schema
    phone: "", // Changed from company_phone to match schema
    email: "", // Changed from company_email to match schema
    taxNumber: "", // TRN (Tax Registration Number) stored in tax_number column
    defaultVatRate: 0.05, // Changed to camelCase to match schema
    currency: "AED", // Changed from default_currency to match schema
    fxGbpToAed: 4.85,
    fxUsdToAed: 3.6725,
    fxInrToAed: 0.0440,
    // Note: Document numbering fields are not in the schema yet
    poNumberPrefix: "PO",
    doNumberPrefix: "DO",
    invoiceNumberPrefix: "INV",
    grnNumberPrefix: "GRN",
    quotationNumberPrefix: "QUO",
    nextPoNumber: 1,
    nextDoNumber: 1,
    nextInvoiceNumber: 1,
    nextGrnNumber: 1,
    nextQuotationNumber: 1
  });
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [trnError, setTrnError] = useState(""); // Added trnError state
  const [logoKey, setLogoKey] = useState(Date.now()); // Added logoKey for forcing image refresh
  const [isEditMode, setIsEditMode] = useState(false); // Added edit mode state
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
          defaultVatRate: loadedSettings.defaultVatRate !== undefined ? loadedSettings.defaultVatRate : 0.05,
          fxGbpToAed: loadedSettings.fxGbpToAed !== undefined ? loadedSettings.fxGbpToAed : 4.85,
          fxUsdToAed: loadedSettings.fxUsdToAed !== undefined ? loadedSettings.fxUsdToAed : 3.6725,
          fxInrToAed: loadedSettings.fxInrToAed !== undefined ? loadedSettings.fxInrToAed : 0.0440
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
    if (field === 'taxNumber') {
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
      const result = await UploadFile({ file });
      
      // Handle both possible response formats
      const fileUrl = result.file_url || result.url;
      
      if (!fileUrl) {
        throw new Error("No file URL returned from upload");
      }
      
      handleInputChange('logo', fileUrl);
      setLogoKey(Date.now()); // Force image refresh
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
    if (settings.taxNumber && !validateTRN(settings.taxNumber)) {
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
      
      setIsEditMode(false); // Exit edit mode after successful save
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

  const handleEdit = () => {
    setIsEditMode(true);
  };

  const handleCancel = async () => {
    // Reload settings to discard changes
    setIsEditMode(false);
    await loadSettings();
  };

  if (initialLoad) {
    return <div>Loading...</div>;
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5" />
            Company Settings
          </div>
          <div className="flex gap-2">
            {isAdmin && !isEditMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
                className="flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </Button>
            )}
            {isAdmin && isEditMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
            )}
          </div>
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
                value={settings.companyName}
                onChange={(e) => handleInputChange('companyName', e.target.value)}
                placeholder="Enter company name"
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="company_email">Company Email *</Label>
              <Input
                id="company_email"
                type="email"
                value={settings.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="company@example.com"
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_phone">Phone Number</Label>
              <Input
                id="company_phone"
                value={settings.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="+971 XX XXX XXXX"
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
            
            {/* New TRN Field */}
            <div className="space-y-2">
              <Label htmlFor="company_trn">Tax Registration Number (TRN)</Label>
              <Input
                id="company_trn"
                value={settings.taxNumber}
                onChange={(e) => handleInputChange('taxNumber', e.target.value)}
                placeholder="100000000000000"
                maxLength={15}
                className={trnError ? "border-red-500 focus-visible:ring-red-500" : (!isEditMode ? "bg-gray-50" : "")}
                readOnly={!isEditMode}
              />
              {trnError && <p className="text-sm text-red-500">{trnError}</p>}
              <p className="text-xs text-gray-500">15-digit UAE Tax Registration Number</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="default_currency">Default Currency</Label>
              <Select
                value={settings.currency}
                onValueChange={(value) => handleInputChange('currency', value)}
                disabled={!isEditMode}
              >
                <SelectTrigger className={!isEditMode ? "bg-gray-50" : ""}>
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
                value={(settings.defaultVatRate * 100).toFixed(2)}
                onChange={(e) => handleInputChange('defaultVatRate', parseFloat(e.target.value) / 100 || 0)}
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
              <p className="text-xs text-gray-500">Used as default for new invoices</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_address">Address</Label>
            <Textarea
              id="company_address"
              value={settings.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              placeholder="Enter company address"
              rows={3}
              readOnly={!isEditMode}
              className={!isEditMode ? "bg-gray-50" : ""}
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
              <div className="flex-shrink-0">
                <div className="w-20 h-20 border-2 border-gray-200 rounded-lg flex items-center justify-center bg-white shadow-sm relative">
                  {settings.logo ? (
                    <>
                      <img
                        key={logoKey}
                        src={settings.logo}
                        alt="Company Logo"
                        className="w-full h-full object-contain rounded-lg"
                        onError={(e) => {
                          console.error("Error loading logo:", e);
                        }}
                      />
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    </>
                  ) : (
                    <Upload className="w-6 h-6 text-gray-400" />
                  )}
                </div>
              </div>
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
                  disabled={loading || !isEditMode}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {loading ? 'Uploading...' : (settings.logo ? 'Change Logo' : 'Upload Logo')}
                </Button>
                {settings.logo && (
                  <p className="text-xs text-green-600 mt-2">✓ Logo uploaded successfully</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Financial Settings */}
        <div className="space-y-4 pt-6 border-t">
          <h3 className="text-lg font-semibold">Financial Settings</h3>
          <div className="space-y-3">
            <Label>Exchange Rates to AED</Label>
            <p className="text-xs text-gray-500">Used for converting supplier costs to AED in purchase orders and reports.</p>

            {/* AED — fixed base */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
              <div className="w-16 text-sm font-semibold text-gray-700">AED</div>
              <div className="flex-1">
                <Input
                  value="1.0000"
                  readOnly
                  className="bg-white text-gray-500 cursor-not-allowed"
                />
              </div>
              <div className="text-xs text-gray-500 w-40">Base currency (fixed)</div>
            </div>

            {/* GBP */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
              <div className="w-16 text-sm font-semibold text-gray-700">GBP</div>
              <div className="flex-1 relative">
                <PoundSterling className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="fx_gbp_to_aed"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={settings.fxGbpToAed}
                  onChange={(e) => handleInputChange('fxGbpToAed', parseFloat(e.target.value) || 0)}
                  className={`pl-9 ${!isEditMode ? "bg-white text-gray-500 cursor-not-allowed" : ""}`}
                  readOnly={!isEditMode}
                />
              </div>
              <div className="text-xs text-gray-500 w-40">1 GBP = {parseFloat(settings.fxGbpToAed ?? 4.85).toFixed(4)} AED</div>
            </div>

            {/* USD */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
              <div className="w-16 text-sm font-semibold text-gray-700">USD</div>
              <div className="flex-1 relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="fx_usd_to_aed"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={settings.fxUsdToAed}
                  onChange={(e) => handleInputChange('fxUsdToAed', parseFloat(e.target.value) || 0)}
                  className={`pl-9 ${!isEditMode ? "bg-white text-gray-500 cursor-not-allowed" : ""}`}
                  readOnly={!isEditMode}
                />
              </div>
              <div className="text-xs text-gray-500 w-40">1 USD = {parseFloat(settings.fxUsdToAed ?? 3.6725).toFixed(4)} AED</div>
            </div>

            {/* INR */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
              <div className="w-16 text-sm font-semibold text-gray-700">INR</div>
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">₹</span>
                <Input
                  id="fx_inr_to_aed"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={settings.fxInrToAed}
                  onChange={(e) => handleInputChange('fxInrToAed', parseFloat(e.target.value) || 0)}
                  className={`pl-9 ${!isEditMode ? "bg-white text-gray-500 cursor-not-allowed" : ""}`}
                  readOnly={!isEditMode}
                />
              </div>
              <div className="text-xs text-gray-500 w-40">1 INR = {parseFloat(settings.fxInrToAed ?? 0.044).toFixed(4)} AED</div>
            </div>
          </div>
        </div>

        {/* Document Numbering */}
        <div className="space-y-4 pt-6 border-t">
          <h3 className="text-lg font-semibold">Document Numbering</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="po_prefix">PO Prefix</Label>
              <Input
                id="po_prefix"
                value={settings.poNumberPrefix}
                onChange={(e) => handleInputChange('poNumberPrefix', e.target.value)}
                placeholder="PO"
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="do_prefix">DO Prefix</Label>
              <Input
                id="do_prefix"
                value={settings.doNumberPrefix}
                onChange={(e) => handleInputChange('doNumberPrefix', e.target.value)}
                placeholder="DO"
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="inv_prefix">Invoice Prefix</Label>
              <Input
                id="inv_prefix"
                value={settings.invoiceNumberPrefix}
                onChange={(e) => handleInputChange('invoiceNumberPrefix', e.target.value)}
                placeholder="INV"
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="grn_prefix">GRN Prefix</Label>
              <Input
                id="grn_prefix"
                value={settings.grnNumberPrefix}
                onChange={(e) => handleInputChange('grnNumberPrefix', e.target.value)}
                placeholder="GRN"
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="quotation_prefix">Quotation Prefix</Label>
              <Input
                id="quotation_prefix"
                value={settings.quotationNumberPrefix}
                onChange={(e) => handleInputChange('quotationNumberPrefix', e.target.value)}
                placeholder="QUO"
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label htmlFor="next_po">Next PO Number</Label>
              <Input
                id="next_po"
                type="number"
                min="1"
                value={settings.nextPoNumber}
                onChange={(e) => handleInputChange('nextPoNumber', parseInt(e.target.value) || 1)}
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="next_do">Next DO Number</Label>
              <Input
                id="next_do"
                type="number"
                min="1"
                value={settings.nextDoNumber}
                onChange={(e) => handleInputChange('nextDoNumber', parseInt(e.target.value) || 1)}
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="next_inv">Next Invoice Number</Label>
              <Input
                id="next_inv"
                type="number"
                min="1"
                value={settings.nextInvoiceNumber}
                onChange={(e) => handleInputChange('nextInvoiceNumber', parseInt(e.target.value) || 1)}
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="next_grn">Next GRN Number</Label>
              <Input
                id="next_grn"
                type="number"
                min="1"
                value={settings.nextGrnNumber}
                onChange={(e) => handleInputChange('nextGrnNumber', parseInt(e.target.value) || 1)}
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="next_quotation">Next Quotation Number</Label>
              <Input
                id="next_quotation"
                type="number"
                min="1"
                value={settings.nextQuotationNumber}
                onChange={(e) => handleInputChange('nextQuotationNumber', parseInt(e.target.value) || 1)}
                readOnly={!isEditMode}
                className={!isEditMode ? "bg-gray-50" : ""}
              />
            </div>
          </div>
        </div>

        {isEditMode && (
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
        )}
      </CardContent>
    </Card>
  );
}
