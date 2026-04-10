import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ZoomIn, ZoomOut, RotateCcw, Grid, Ruler, Eye } from 'lucide-react';
import POTemplate from '@/components/print/POTemplate';
import QuotationTemplate from '@/components/print/QuotationTemplate';

export default function PrintSandboxPage() {
  const [showRulers, setShowRulers] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [highlightDifferences, setHighlightDifferences] = useState(false);
  const [zoom, setZoom] = useState([85]);
  const [syncScroll, setSyncScroll] = useState(true);

  // Mock data structure that works for both templates
  const mockData = {
    // PO Template fields
    po_number: 'PO-2025-001',
    order_date: '2025-01-15',
    expected_delivery_date: '2025-01-25',
    currency: 'AED',
    status: 'pending',
    subtotal: 2850.00,
    tax_amount: 142.50,
    total_amount: 2992.50,
    notes: 'Please ensure all items are delivered in good condition. Contact our warehouse manager for any delivery schedule changes.',
    terms_conditions: 'Payment terms: Net 30 days. All returns must be authorized within 7 days of delivery.',
    
    // Quotation Template fields (mapped to PO equivalents)
    quoteNumber: 'PO-2025-001',
    quoteDate: '2025-01-15',
    customerName: 'Acme Electronics LLC',
    customerContactPerson: 'John Smith',
    customerBillingAddress: 'Building 123, Office 456\nBusiness Bay, Dubai\nUAE',
    customerPhone: '+971-4-123-4567',
    customerEmail: 'john.smith@acme-electronics.com',
    reference: 'REF-2025-001',
    referenceDate: '2025-01-10',
    totalAmount: 2850.00,
    vatAmount: 142.50,
    grandTotal: 2992.50,
    remarks: 'Please ensure all items are delivered in good condition. Contact our warehouse manager for any delivery schedule changes.',
    
    // Shared items structure
    items: [
      {
        product_code: 'ELEC-001',
        description: 'Industrial Grade Power Supply Unit 500W',
        size: 'Standard',
        quantity: 5,
        unit_price: 150.00,
        line_total: 750.00
      },
      {
        product_code: 'ELEC-002',
        description: 'High Performance LED Display Module 32"',
        size: 'Large',
        quantity: 3,
        unit_price: 450.00,
        line_total: 1350.00
      },
      {
        product_code: 'ELEC-003',
        description: 'Wireless Communication Board v2.1',
        size: 'Compact',
        quantity: 10,
        unit_price: 75.00,
        line_total: 750.00
      }
    ]
  };

  // Mock brand/supplier data
  const mockBrand = {
    name: 'TechnoElectronics Trading LLC',
    contact_person: 'Ahmad Hassan',
    contact_email: 'ahmad.hassan@techno-electronics.com',
    contact_phone: '+971-4-987-6543',
    website: 'www.techno-electronics.com'
  };

  // Mock company settings
  const mockSettings = {
    // PO Template settings
    company_logo_url: '/flow-logo-latest.jpeg',
    company_name: 'Supernature Trading LLC',
    company_address: 'Warehouse Complex 789\nAl Awir, Dubai\nUAE',
    company_phone: '+971-4-555-0123',
    company_email: 'info@supernature.ae',
    company_trn: '123456789012345',
    
    // Quotation Template settings (same company, different field names)
    logo: '/flow-logo-latest.jpeg',
    companyName: 'Supernature Trading LLC',
    address: 'Warehouse Complex 789\nAl Awir, Dubai\nUAE',
    phone: '+971-4-555-0123',
    email: 'info@supernature.ae',
    trn: '123456789012345'
  };

  const handleZoomIn = () => {
    setZoom([Math.min(zoom[0] + 10, 200)]);
  };

  const handleZoomOut = () => {
    setZoom([Math.max(zoom[0] - 10, 25)]);
  };

  const handleZoomReset = () => {
    setZoom([85]);
  };

  const handleSyncScroll = (e: any) => {
    if (!syncScroll) return;
    
    const scrollTop = e.target.scrollTop;
    const scrollLeft = e.target.scrollLeft;
    
    // Find the other template container and sync its scroll
    const containers = document.querySelectorAll('.template-container');
    containers.forEach((container: any) => {
      if (container !== e.target) {
        container.scrollTop = scrollTop;
        container.scrollLeft = scrollLeft;
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4" data-testid="print-sandbox-page">
      {/* Control Panel */}
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Print Template Sandbox</h1>
            <Badge variant="secondary">Development Tool</Badge>
          </div>
          
          <Separator orientation="vertical" className="h-8" />
          
          {/* Zoom Controls */}
          <div className="flex items-center gap-2">
            <Label htmlFor="zoom" className="text-sm font-medium">Zoom:</Label>
            <Button
              variant="outline"
              
              onClick={handleZoomOut}
              data-testid="button-zoom-out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <div className="w-20 text-center text-sm font-medium">
              {zoom[0]}%
            </div>
            <Button
              variant="outline"
              
              onClick={handleZoomIn}
              data-testid="button-zoom-in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              
              onClick={handleZoomReset}
              data-testid="button-zoom-reset"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          <Separator orientation="vertical" className="h-8" />

          {/* Display Options */}
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="rulers"
                checked={showRulers}
                onCheckedChange={setShowRulers}
                data-testid="switch-rulers"
              />
              <Label htmlFor="rulers" className="flex items-center gap-1">
                <Ruler className="h-4 w-4" />
                Rulers
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="grid"
                checked={showGrid}
                onCheckedChange={setShowGrid}
                data-testid="switch-grid"
              />
              <Label htmlFor="grid" className="flex items-center gap-1">
                <Grid className="h-4 w-4" />
                Grid
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="differences"
                checked={highlightDifferences}
                onCheckedChange={setHighlightDifferences}
                data-testid="switch-differences"
              />
              <Label htmlFor="differences" className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                Highlight Differences
              </Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="sync-scroll"
                checked={syncScroll}
                onCheckedChange={setSyncScroll}
                data-testid="switch-sync-scroll"
              />
              <Label htmlFor="sync-scroll">Sync Scroll</Label>
            </div>
          </div>
        </div>
      </Card>

      {/* Template Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Purchase Order Template */}
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Purchase Order Template</h2>
            <Badge variant="outline">POTemplate.jsx</Badge>
          </div>
          <div 
            className={`template-container relative overflow-auto border rounded-lg bg-white ${
              showGrid ? 'bg-grid-pattern' : ''
            }`}
            style={{
              height: '80vh',
              transform: `scale(${zoom[0] / 100})`,
              transformOrigin: 'top left',
              width: `${100 / (zoom[0] / 100)}%`
            }}
            onScroll={handleSyncScroll}
            data-testid="template-po"
          >
            {showRulers && (
              <>
                {/* Horizontal Ruler */}
                <div className="absolute top-0 left-0 right-0 h-6 bg-yellow-100 border-b border-yellow-300 flex items-center text-xs text-yellow-800 px-2 z-10">
                  <div className="flex w-full">
                    {Array.from({ length: 21 }, (_, i) => (
                      <div key={i} className="flex-1 border-r border-yellow-300 text-center">
                        {i * 10}mm
                      </div>
                    ))}
                  </div>
                </div>
                {/* Vertical Ruler */}
                <div className="absolute top-0 left-0 bottom-0 w-6 bg-yellow-100 border-r border-yellow-300 flex flex-col items-center text-xs text-yellow-800 py-2 z-10">
                  {Array.from({ length: 30 }, (_, i) => (
                    <div key={i} className="flex-1 border-b border-yellow-300 writing-mode-vertical text-center">
                      {i * 10}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className={`${showRulers ? 'ml-6 mt-6' : ''} ${highlightDifferences ? 'highlight-differences-po' : ''}`}>
              <POTemplate 
                data={mockData}
                brand={mockBrand}
                settings={mockSettings}
              />
            </div>
          </div>
        </Card>

        {/* Quotation Template */}
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Quotation Template</h2>
            <Badge variant="outline">QuotationTemplate.jsx</Badge>
          </div>
          <div 
            className={`template-container relative overflow-auto border rounded-lg bg-white ${
              showGrid ? 'bg-grid-pattern' : ''
            }`}
            style={{
              height: '80vh',
              transform: `scale(${zoom[0] / 100})`,
              transformOrigin: 'top left',
              width: `${100 / (zoom[0] / 100)}%`
            }}
            onScroll={handleSyncScroll}
            data-testid="template-quotation"
          >
            {showRulers && (
              <>
                {/* Horizontal Ruler */}
                <div className="absolute top-0 left-0 right-0 h-6 bg-yellow-100 border-b border-yellow-300 flex items-center text-xs text-yellow-800 px-2 z-10">
                  <div className="flex w-full">
                    {Array.from({ length: 21 }, (_, i) => (
                      <div key={i} className="flex-1 border-r border-yellow-300 text-center">
                        {i * 10}mm
                      </div>
                    ))}
                  </div>
                </div>
                {/* Vertical Ruler */}
                <div className="absolute top-0 left-0 bottom-0 w-6 bg-yellow-100 border-r border-yellow-300 flex flex-col items-center text-xs text-yellow-800 py-2 z-10">
                  {Array.from({ length: 30 }, (_, i) => (
                    <div key={i} className="flex-1 border-b border-yellow-300 writing-mode-vertical text-center">
                      {i * 10}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className={`${showRulers ? 'ml-6 mt-6' : ''} ${highlightDifferences ? 'highlight-differences-quotation' : ''}`}>
              <QuotationTemplate 
                data={mockData}
                customer={mockData}
                settings={mockSettings}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Data Structure Information */}
      <Card className="mt-6 p-6">
        <h3 className="text-lg font-semibold mb-4">Test Data Structure</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium mb-2">Items ({mockData.items.length})</h4>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>Total Quantity: {mockData.items.reduce((sum: any, item: any) => sum + item.quantity, 0)} items</p>
              <p>Subtotal: {mockData.currency} {mockData.subtotal.toFixed(2)}</p>
              <p>Tax: {mockData.currency} {mockData.tax_amount.toFixed(2)}</p>
              <p>Total: {mockData.currency} {mockData.total_amount.toFixed(2)}</p>
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-2">Template Differences</h4>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>• PO shows Supplier/Brand details</p>
              <p>• Quotation shows Customer details</p>
              <p>• Different field mappings for same data</p>
              <p>• Size column only in Quotation</p>
            </div>
          </div>
        </div>
      </Card>

      <style {...{jsx: true} as any}>{`
        .bg-grid-pattern {
          background-image: 
            linear-gradient(to right, #e5e7eb 1px, transparent 1px),
            linear-gradient(to bottom, #e5e7eb 1px, transparent 1px);
          background-size: 20px 20px;
        }
        
        .highlight-differences-po *,
        .highlight-differences-quotation * {
          outline: 1px solid rgba(239, 68, 68, 0.3) !important;
        }
        
        .writing-mode-vertical {
          writing-mode: vertical-lr;
          text-orientation: mixed;
        }
      `}</style>
    </div>
  );
}