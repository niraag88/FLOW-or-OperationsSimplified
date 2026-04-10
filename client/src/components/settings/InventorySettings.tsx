import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Package, Save, Plus, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function InventorySettings() {
  const [settings, setSettings] = useState({
    lowStockThreshold: 6,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showInitialStock, setShowInitialStock] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [initialStockData, setInitialStockData] = useState<any>({});

  const { toast } = useToast();

  const loadSettings = async () => {
    try {
      const response = await apiRequest("GET", "/api/company-settings");
      const companySettings = await response.json();
      setSettings({
        lowStockThreshold: companySettings.lowStockThreshold || 6,
      });
    } catch (error: any) {
      console.error("Error loading inventory settings:", error);
      toast({
        title: "Error",
        description: "Failed to load inventory settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const response = await apiRequest("GET", "/api/products");
      const productsList = await response.json();
      setProducts(productsList);
      // Initialize stock data for all products
      const stockData: Record<string, any> = {};
      productsList.forEach((product: any) => {
        stockData[product.id] = {
          quantity: 0,
          notes: '',
        };
      });
      setInitialStockData(stockData);
    } catch (error: any) {
      console.error("Error loading products:", error);
    }
  };

  useEffect(() => {
    loadSettings();
    loadProducts();
  }, []);

  const handleSettingsChange = (field: any, value: any) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleStockChange = (productId: any, field: any, value: any) => {
    setInitialStockData((prev: any) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }));
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const threshold = parseInt(String(settings.lowStockThreshold)) || 6;
      await apiRequest("PUT", "/api/company-settings", {
        lowStockThreshold: threshold,
      });

      // Invalidate caches so the dashboard and inventory page
      // immediately reflect the updated threshold without a page refresh.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/products/stock-analysis"] }),
      ]);

      toast({
        title: "Settings saved",
        description: `Low stock threshold updated to ${threshold} units. The dashboard will now reflect this change.`,
      });
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast({
        title: "Failed to save settings",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addInitialStock = async () => {
    setIsSaving(true);
    try {
      // Process each product with stock > 0
      const stockEntries = Object.entries(initialStockData as Record<string, any>)
        .filter(([_, data]: [string, any]) => data.quantity > 0)
        .map(([productId, data]: [string, any]) => ({
          productId: parseInt(productId),
          quantity: parseInt(data.quantity),
          movementType: 'adjustment',
          notes: data.notes || 'Initial stock entry',
        }));

      if (stockEntries.length === 0) {
        toast({
          title: "Warning",
          description: "No stock quantities entered",
          variant: "destructive",
        });
        return;
      }

      await apiRequest("POST", "/api/stock-movements/bulk", {
        movements: stockEntries
      });

      toast({
        title: "Success",
        description: `Initial stock added for ${stockEntries.length} products`,
      });

      // Reset form
      setShowInitialStock(false);
      const resetData: Record<string, any> = {};
      products.forEach((product: any) => {
        resetData[product.id] = { quantity: 0, notes: '' };
      });
      setInitialStockData(resetData);

    } catch (error: any) {
      console.error("Error adding initial stock:", error);
      toast({
        title: "Error", 
        description: "Failed to add initial stock",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-center">
          <Package className="w-8 h-8 mx-auto mb-2 text-gray-400 animate-spin" />
          <p className="text-gray-500">Loading inventory settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Inventory Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
              <Input
                id="lowStockThreshold"
                type="number"
                min="1"
                max="100"
                value={settings.lowStockThreshold}
                onChange={(e) => handleSettingsChange('lowStockThreshold', parseInt(e.target.value) || 6)}
              />
              <p className="text-xs text-gray-500">
                Products with {settings.lowStockThreshold} or fewer items will show as low stock
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button onClick={saveSettings} disabled={isSaving} data-testid="button-save-inventory-settings">
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Initial Stock Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-yellow-800">Initial Stock Entry</h4>
                  <p className="text-sm text-yellow-700">
                    Use this to set starting stock quantities for your products when beginning to use the automated inventory system.
                  </p>
                </div>
              </div>
            </div>

            {!showInitialStock ? (
              <Button 
                onClick={() => setShowInitialStock(true)}
                variant="outline"
                data-testid="button-add-initial-stock"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Initial Stock
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4">
                  {products.map((product: any) => (
                    <div key={product.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{product.name}</h4>
                          <p className="text-sm text-gray-500">Product Code: {product.sku}</p>
                          <p className="text-xs text-gray-500">Current: {product.stockQuantity || 0} units</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor={`stock-${product.id}`}>Initial Quantity</Label>
                          <Input
                            id={`stock-${product.id}`}
                            type="number"
                            min="0"
                            value={initialStockData[product.id]?.quantity || 0}
                            onChange={(e) => handleStockChange(product.id, 'quantity', parseInt(e.target.value) || 0)}
                            data-testid={`input-stock-${product.id}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`notes-${product.id}`}>Notes (Optional)</Label>
                          <Input
                            id={`notes-${product.id}`}
                            value={initialStockData[product.id]?.notes || ''}
                            onChange={(e) => handleStockChange(product.id, 'notes', e.target.value)}
                            placeholder="e.g., Opening stock count"
                            data-testid={`input-notes-${product.id}`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button onClick={addInitialStock} disabled={isSaving} data-testid="button-confirm-initial-stock">
                    <Save className="w-4 h-4 mr-2" />
                    {isSaving ? "Adding Stock..." : "Add Initial Stock"}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowInitialStock(false)}
                    data-testid="button-cancel-initial-stock"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}