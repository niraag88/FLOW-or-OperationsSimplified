
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Save, X, Users } from "lucide-react";
import { Customer } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import { logAuditAction } from "../utils/auditLogger";
import CustomerActionsDropdown from "./CustomerActionsDropdown";

export default function CustomerManagement() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    contactPerson: "",
    billingAddress: "",
    vatTreatment: "Local",
    vatNumber: "",
    isActive: true
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const customersData = await Customer.list('name');
      setCustomers(customersData);
    } catch (error) {
      console.error("Error loading customers:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      contactPerson: "",
      billingAddress: "",
      vatTreatment: "Local",
      vatNumber: "",
      isActive: true
    });
    setEditingCustomer(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const customerData = { ...formData };
      
      // Clear VAT Number if customer is International
      if (customerData.vatTreatment === "International") {
        customerData.vatNumber = "";
      }

      if (editingCustomer) {
        await Customer.update(editingCustomer.id, customerData);
        await logAuditAction("Customer", editingCustomer.id, "update", "admin@example.com", { updated_fields: Object.keys(customerData) });
        toast({
          title: "Success",
          description: "Customer updated successfully.",
        });
      } else {
        const newCustomer = await Customer.create(customerData);
        await logAuditAction("Customer", newCustomer.id, "create", "admin@example.com", { name: customerData.name });
        toast({
          title: "Success",
          description: "Customer created successfully.",
        });
      }

      loadCustomers();
      resetForm();
    } catch (error) {
      console.error("Error saving customer:", error);
      toast({
        title: "Error",
        description: "Failed to save customer.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (customer) => {
    setFormData(customer);
    setEditingCustomer(customer);
    setShowForm(true);
  };
  

  const handleToggleActive = async (customer) => {
    try {
      await Customer.update(customer.id, { ...customer, isActive: !customer.isActive });
      await logAuditAction("Customer", customer.id, "status_change", "admin@example.com", { 
        status: { from: customer.isActive, to: !customer.isActive }
      });
      loadCustomers();
    } catch (error) {
      console.error("Error updating customer status:", error);
    }
  };

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Customer Management
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Manage customer information and settings for VAT and billing.
            </p>
          </div>
          <Button 
            onClick={() => setShowForm(true)} 
            className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Customer
          </Button>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">


          {loading ? (
            <div className="text-center py-8">Loading customers...</div>
          ) : (
            <div className="space-y-4">
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Customer Name</TableHead>
                      <TableHead className="min-w-[100px]">Contact Name</TableHead>
                      <TableHead className="min-w-[80px]">Type</TableHead>
                      <TableHead className="min-w-[100px]">TRN Number</TableHead>
                      <TableHead className="min-w-[80px]">Status</TableHead>
                      <TableHead className="min-w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell>
                          <div className="truncate">{customer.contactPerson}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={customer.vatTreatment === 'Local' ? 'default' : 'secondary'}>
                            {customer.vatTreatment}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="truncate">{customer.vatNumber || '-'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={customer.isActive}
                              onCheckedChange={() => handleToggleActive(customer)}
                              size="sm"
                            />
                            <span className={customer.isActive ? 'text-green-600' : 'text-gray-400'}>
                              {customer.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <CustomerActionsDropdown 
                            customer={customer}
                            onEdit={handleEdit}
                            onRefresh={loadCustomers}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden space-y-4">
                {customers.map((customer) => (
                  <Card key={customer.id} className="p-4">
                    <div className="flex flex-col space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="min-w-0 flex-1 pr-2">
                          <h3 className="font-semibold text-gray-900 truncate">{customer.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={customer.vatTreatment === 'Local' ? 'default' : 'secondary'}>
                              {customer.vatTreatment}
                            </Badge>
                            <Switch
                              checked={customer.isActive}
                              onCheckedChange={() => handleToggleActive(customer)}
                              size="sm"
                            />
                            <span className={`text-xs ${customer.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                              {customer.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <CustomerActionsDropdown 
                            customer={customer}
                            onEdit={handleEdit}
                            onRefresh={loadCustomers}
                          />
                        </div>
                      </div>
                      
                      {customer.contactPerson && (
                        <div className="text-sm">
                          <strong>Contact:</strong> {customer.contactPerson}
                        </div>
                      )}
                      
                      {customer.vatNumber && (
                        <div className="text-sm">
                          <strong>TRN:</strong> {customer.vatNumber}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              {customers.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No customers found</p>
                  <p className="text-sm">Add your first customer to get started.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Customer Form Dialog - Mobile Optimized */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-0">
            <div className="p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle className="text-lg sm:text-xl">
                  {editingCustomer ? `Edit Customer: ${editingCustomer.name}` : 'Add New Customer'}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {editingCustomer ? 'Update customer information and VAT settings' : 'Create a new customer with proper VAT treatment'}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Customer Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value.slice(0, 50) }))}
                      placeholder="e.g., The Chedi, ACME Corp"
                      maxLength={50}
                      required
                    />
                    <p className="text-xs text-gray-500">{formData.name.length}/50 characters</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="contactPerson">Contact Name *</Label>
                    <Input
                      id="contactPerson"
                      value={formData.contactPerson}
                      onChange={(e) => setFormData(prev => ({ ...prev, contactPerson: e.target.value.slice(0, 20) }))}
                      placeholder="John Doe"
                      maxLength={20}
                      required
                    />
                    <p className="text-xs text-gray-500">{formData.contactPerson.length}/20 characters</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="billingAddress">Address</Label>
                  <Textarea
                    id="billingAddress"
                    value={formData.billingAddress}
                    onChange={(e) => setFormData(prev => ({ ...prev, billingAddress: e.target.value }))}
                    placeholder="Customer billing address (optional - will appear in invoice outputs if provided)"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Customer Type *</Label>
                    <Select 
                      value={formData.vatTreatment} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, vatTreatment: value, vatNumber: value === "International" ? "" : prev.vatNumber }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Local">Local (VAT applies)</SelectItem>
                        <SelectItem value="International">International (VAT zero)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.vatTreatment === "Local" && (
                    <div className="space-y-2">
                      <Label htmlFor="vatNumber">TRN Number</Label>
                      <Input
                        id="vatNumber"
                        value={formData.vatNumber}
                        onChange={(e) => setFormData(prev => ({ ...prev, vatNumber: e.target.value }))}
                        placeholder="Tax Registration Number"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(value) => setFormData(prev => ({ ...prev, isActive: value }))}
                  />
                  <Label htmlFor="isActive">Active Customer</Label>
                </div>

                {/* Action Buttons - Mobile Optimized */}
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={resetForm}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
                  >
                    {loading ? "Saving..." : editingCustomer ? "Update Customer" : "Create Customer"}
                  </Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    </>
  );
}
