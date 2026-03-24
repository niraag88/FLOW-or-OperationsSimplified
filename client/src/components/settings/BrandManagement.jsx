
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Building2, ExternalLink } from "lucide-react";
import { Brand, RecycleBin, AuditLog } from "@/api/entities";
import { useAuth } from "@/hooks/useAuth";
import { logAuditAction } from "../utils/auditLogger";
import { useToast } from "@/components/ui/use-toast";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";

const initialFormData = {
  name: "",
  address: "",
  contact_person: "",
  contact_email: "",
  contact_phone: "",
  isActive: true,
  sort_order: 0
};

export default function BrandManagement() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [formData, setFormData] = useState(initialFormData);
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [brandToDelete, setBrandToDelete] = useState(null);
  const { user: currentUser } = useAuth();
  const canDelete = ['Admin', 'Manager'].includes(currentUser?.role);

  useEffect(() => {
    loadBrands();
  }, []);

  const loadBrands = async () => {
    setLoading(true);
    try {
      const brandsData = await Brand.list('sort_order');
      setBrands(brandsData);
    } catch (error) {
      console.error("Error loading brands:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Brand name is required.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Map address back to description for API
      const apiData = {
        name: formData.name,
        description: formData.address,
        contactPerson: formData.contact_person,
        contactEmail: formData.contact_email,
        contactPhone: formData.contact_phone,
        isActive: formData.isActive,
        sortOrder: formData.sort_order
      };
      
      if (editingBrand) {
        await Brand.update(editingBrand.id, apiData);
        await logAuditAction("Brand", editingBrand.id, "update", currentUser?.email, { updated_brand: formData });
        toast({
          title: "Success",
          description: "Brand updated successfully.",
        });
      } else {
        const newBrand = await Brand.create(apiData);
        await logAuditAction("Brand", newBrand.id, "create", currentUser?.email, { created_brand: formData });
        toast({
          title: "Success",
          description: "Brand created successfully.",
        });
      }
      
      handleCloseForm();
      loadBrands();
    } catch (error) {
      console.error("Error saving brand:", error);
      toast({
        title: "Error",
        description: "Failed to save brand.",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (brand) => {
    setEditingBrand(brand);
    setFormData({
      name: brand.name || "",
      address: brand.description || "", // Map description to address
      contact_person: brand.contactPerson || "",
      contact_email: brand.contactEmail || "",
      contact_phone: brand.contactPhone || "",
      isActive: brand.isActive !== undefined ? brand.isActive : true,
      sort_order: brand.sortOrder || 0
    });
    setShowForm(true);
  };

  const handleToggleActive = async (brand) => {
    try {
      await Brand.update(brand.id, {
        name: brand.name,
        description: brand.description,
        contactPerson: brand.contactPerson,
        contactEmail: brand.contactEmail,
        contactPhone: brand.contactPhone,
        isActive: !brand.isActive,
        sortOrder: brand.sortOrder
      });
      loadBrands();
    } catch (error) {
      console.error("Error updating brand status:", error);
    }
  };

  const handleDeleteClick = (brand) => {
    setBrandToDelete(brand);
    setDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    if (!brandToDelete) return;
    
    try {
      // Move to recycle bin
      await RecycleBin.create({
        document_type: 'Brand',
        document_id: brandToDelete.id,
        document_number: brandToDelete.name,
        document_data: brandToDelete,
        deleted_by: currentUser?.email || 'unknown',
        deleted_date: new Date().toISOString(),
        reason: 'Deleted from UI',
        original_status: brandToDelete.isActive ? 'Active' : 'Inactive',
        can_restore: true
      });

      // Log the deletion
      await AuditLog.create({
        entity_type: 'Brand',
        entity_id: brandToDelete.id,
        action: 'deleted',
        user_email: currentUser?.email || 'unknown',
        changes: { 
          brand_name: brandToDelete.name,
          deletion_reason: 'Deleted from UI',
          moved_to_recycle_bin: true
        },
        timestamp: new Date().toISOString()
      });

      // Delete from main table
      await Brand.delete(brandToDelete.id);
      
      toast({
        title: "Brand Deleted",
        description: `${brandToDelete.name} has been moved to the recycle bin.`,
      });
      loadBrands();
    } catch (error) {
      console.error("Error deleting brand:", error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete the brand. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDialogOpen(false);
      setBrandToDelete(null);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingBrand(null);
    setFormData(initialFormData);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between space-y-2 sm:space-y-0">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Brand Management
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Manage brands for use across products, purchase orders, delivery orders, and invoices.
            </p>
          </div>
          <Button 
            onClick={() => setShowForm(true)} 
            className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Brand
          </Button>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {loading ? (
            <div className="text-center py-8">Loading brands...</div>
          ) : (
            <div className="space-y-4">
              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">Brand Name</TableHead>
                      <TableHead className="min-w-[120px]">Contact Name</TableHead>
                      <TableHead className="min-w-[120px]">Email</TableHead>
                      <TableHead className="min-w-[80px]">Status</TableHead>
                      <TableHead className="min-w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brands.map((brand) => (
                      <TableRow key={brand.id}>
                        <TableCell className="font-medium">{brand.name}</TableCell>
                        <TableCell>
                          <div className="truncate">{brand.contactPerson || '-'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="truncate">{brand.contactEmail || '-'}</div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            brand.isActive 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {brand.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => handleEdit(brand)}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            {canDelete && (
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="text-red-500 hover:text-red-600"
                                onClick={() => handleDeleteClick(brand)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden space-y-4">
                {brands.map((brand) => (
                  <Card key={brand.id} className="p-4">
                    <div className="flex flex-col space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="min-w-0 flex-1 pr-2">
                          <h3 className="font-semibold text-gray-900 truncate">{brand.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Switch
                              checked={brand.isActive}
                              onCheckedChange={() => handleToggleActive(brand)}
                              size="sm"
                            />
                            <span className={`text-xs ${brand.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                              {brand.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(brand)}>
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          {canDelete && (
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-red-500"
                              onClick={() => handleDeleteClick(brand)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {brand.contactPerson && (
                        <div className="text-sm">
                          <strong>Contact:</strong> {brand.contactPerson}
                        </div>
                      )}
                      
                      {brand.contactEmail && (
                        <div className="text-sm">
                          <strong>Email:</strong> 
                          <div className="text-gray-500 break-all">{brand.contactEmail}</div>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              {brands.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No brands found</p>
                  <p className="text-sm">Add your first brand to get started.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Brand Form Dialog - Mobile Optimized */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-0">
            <div className="p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle className="text-lg sm:text-xl">
                  {editingBrand ? `Edit Brand: ${editingBrand.name}` : 'Add New Brand'}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {editingBrand ? 'Update brand information' : 'Create a new brand for use across the system'}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Brand Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="e.g., Apple, Samsung, Nike"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sort_order">Sort Order</Label>
                    <Input
                      id="sort_order"
                      type="number"
                      value={formData.sort_order}
                      onChange={(e) => handleInputChange('sort_order', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    placeholder="Company address"
                    rows={3}
                  />
                </div>


                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact_person">Contact Person</Label>
                    <Input
                      id="contact_person"
                      value={formData.contact_person}
                      onChange={(e) => handleInputChange('contact_person', e.target.value)}
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact_email">Contact Email</Label>
                    <Input
                      id="contact_email"
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => handleInputChange('contact_email', e.target.value)}
                      placeholder="contact@brand.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact_phone">Contact Phone</Label>
                    <Input
                      id="contact_phone"
                      value={formData.contact_phone}
                      onChange={(e) => handleInputChange('contact_phone', e.target.value)}
                      placeholder="+1 234 567 8900"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => handleInputChange('isActive', checked)}
                  />
                  <Label htmlFor="isActive">Active</Label>
                </div>

                {/* Action Buttons - Mobile Optimized */}
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleCloseForm}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
                  >
                    {editingBrand ? 'Update Brand' : 'Create Brand'}
                  </Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
      
      <SimpleConfirmDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Confirm Deletion"
        description={`Do you wish to confirm deleting brand "${brandToDelete?.name}"?`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
    </>
  );
}
