
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
import { Plus, Edit2, Trash2, Save, X } from "lucide-react";
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Customer Management</h3>
          <p className="text-sm text-gray-600">Manage customer information and settings</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Customer
        </Button>
      </div>

      {/* Customer Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Customer Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value.slice(0, 50) }))}
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
                  placeholder="Optional - will appear in invoice outputs if provided"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <SelectItem value="Local">Local</SelectItem>
                      <SelectItem value="International">International</SelectItem>
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

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={resetForm}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  <Save className="w-4 h-4 mr-2" />
                  {loading ? "Saving..." : editingCustomer ? "Update Customer" : "Create Customer"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Customers List */}
      <Card>
        <CardHeader>
          <CardTitle>Customers ({customers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Contact Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>TRN Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.contactPerson}</TableCell>
                    <TableCell>
                      <Badge variant={customer.vatTreatment === 'Local' ? 'default' : 'secondary'}>
                        {customer.vatTreatment}
                      </Badge>
                    </TableCell>
                    <TableCell>{customer.vatNumber || '-'}</TableCell>
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

          {customers.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No customers found. Add your first customer to get started.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
