import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { Customer } from "@/api/entities";
import { User } from "@/api/entities";
import CustomerForm from "../components/customers/CustomerForm";
import CustomerList from "../components/customers/CustomerList";

export default function Customers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    loadData();
    loadCurrentUser();
  }, [refreshTrigger]);

  const loadCurrentUser = async () => {
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error: any) {
      console.error("Error loading current user:", error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const customersData = await Customer.list('-updated_date');
      setCustomers(customersData);
    } catch (error: any) {
      console.error("Error loading customers data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleNewCustomer = () => {
    setEditingCustomer(null);
    setShowCustomerForm(true);
  };

  const handleEditCustomer = (customer: any) => {
    setEditingCustomer(customer);
    setShowCustomerForm(true);
  };

  const handleCloseCustomerForm = () => {
    setShowCustomerForm(false);
    setEditingCustomer(null);
  };

  const canEdit = currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Ops');

  const filteredCustomers = customers.filter((customer: any) =>
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-600">Manage customer information and VAT defaults</p>
        </div>
        
        <div className="flex items-center gap-3">
          {canEdit && (
            <Button 
              onClick={handleNewCustomer}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Customer
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Customer List */}
      <CustomerList 
        customers={filteredCustomers}
        loading={loading}
        canEdit={canEdit}
        currentUser={currentUser}
        onEdit={handleEditCustomer}
        onRefresh={handleRefresh}
      />

      {/* Customer Form Modal */}
      <CustomerForm
        open={showCustomerForm}
        onClose={handleCloseCustomerForm}
        editingCustomer={editingCustomer}
        currentUser={currentUser}
        onSuccess={handleRefresh}
      />
    </div>
  );
}