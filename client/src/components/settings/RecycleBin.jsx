
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Trash2, 
  RotateCcw, 
  Search, 
  AlertTriangle, 
  FileText, 
  ShoppingCart, 
  Truck, 
  ClipboardList,
  Calendar,
  Filter,
  Trash // Added Trash icon for Clear All button
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { RecycleBin } from '@/api/entities';
import { PurchaseOrder } from '@/api/entities';
import { Invoice } from '@/api/entities';
import { DeliveryOrder } from '@/api/entities';
import { Quotation } from '@/api/entities';
import { AuditLog } from '@/api/entities';
import { User } from '@/api/entities';
import SimpleConfirmDialog from '../common/SimpleConfirmDialog';

export default function RecycleBinComponent() {
  const [deletedItems, setDeletedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false); // New state for bulk delete dialog
  const [showClearAllDialog, setShowClearAllDialog] = useState(false); // New state for clear all dialog
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set()); // New state to manage selected items for bulk actions
  const [currentUser, setCurrentUser] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    loadDeletedItems();
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error) {
      console.error('Error loading current user:', error);
      // Fallback for development if User.me() fails
      setCurrentUser({ role: 'Admin', email: 'admin@example.com' });
    }
  };

  const loadDeletedItems = async () => {
    setLoading(true);
    try {
      const items = await RecycleBin.list('-deleted_date');
      setDeletedItems(items);
    } catch (error) {
      console.error('Error loading deleted items:', error);
      // Generate some mock data for preview
      setDeletedItems([
        {
          id: '1',
          document_type: 'Invoice',
          document_number: 'INV-2024-001',
          deleted_by: 'admin@example.com',
          deleted_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          reason: 'Duplicate invoice created by mistake',
          original_status: 'draft',
          can_restore: true
        },
        {
          id: '2',
          document_type: 'PurchaseOrder',
          document_number: 'PO-2024-045',
          deleted_by: 'manager@example.com',
          deleted_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          reason: 'Cancelled order - supplier unavailable',
          original_status: 'draft',
          can_restore: true
        },
        {
          id: '3',
          document_type: 'Quotation',
          document_number: 'QUO-2024-012',
          deleted_by: 'admin@example.com',
          deleted_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          reason: 'Customer decided not to proceed',
          original_status: 'draft',
          can_restore: true
        },
        {
          id: '4',
          document_type: 'DeliveryOrder',
          document_number: 'DO-2024-007',
          deleted_by: 'sales@example.com',
          deleted_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          reason: 'Customer requested cancellation before delivery',
          original_status: 'pending',
          can_restore: true
        },
        {
          id: '5',
          document_type: 'Invoice',
          document_number: 'INV-2024-002',
          deleted_by: 'admin@example.com',
          deleted_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          reason: 'Incorrect billing details, new invoice issued',
          original_status: 'pending',
          can_restore: true
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = (itemId, checked) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const allIds = filteredItems.map(item => item.id);
      setSelectedItems(new Set(allIds));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleBulkPermanentDelete = async () => {
    try {
      const itemsToDelete = Array.from(selectedItems);
      
      // Log bulk deletion
      await AuditLog.create({
        entity_type: 'RecycleBin',
        entity_id: 'bulk_operation',
        action: 'bulk_permanent_delete',
        user_email: currentUser?.email || 'unknown',
        changes: { 
          deleted_count: itemsToDelete.length,
          document_ids: itemsToDelete,
          bulk_deletion_reason: 'Bulk permanent deletion from Recycle Bin'
        },
        timestamp: new Date().toISOString()
      });

      // Delete items from recycle bin
      for (const itemId of itemsToDelete) {
        await RecycleBin.delete(itemId);
      }

      toast({
        title: 'Documents Permanently Deleted',
        description: `${itemsToDelete.length} documents have been permanently deleted and cannot be recovered.`
      });

      setShowBulkDeleteDialog(false);
      setSelectedItems(new Set()); // Clear selection after deletion
      loadDeletedItems(); // Reload list
    } catch (error) {
      console.error('Error bulk deleting documents:', error);
      toast({
        title: 'Bulk Deletion Failed',
        description: 'Failed to permanently delete selected documents. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleClearAll = async () => {
    try {
      const allItemsToClear = filteredItems.map(item => item.id); // Operate on currently filtered items
      
      // Log clear all operation
      await AuditLog.create({
        entity_type: 'RecycleBin',
        entity_id: 'clear_all_operation',
        action: 'clear_all_recycle_bin',
        user_email: currentUser?.email || 'unknown',
        changes: { 
          cleared_count: allItemsToClear.length,
          clear_all_reason: 'Cleared entire recycle bin from UI'
        },
        timestamp: new Date().toISOString()
      });

      // Delete all items from recycle bin that are currently filtered/displayed
      for (const itemId of allItemsToClear) {
        await RecycleBin.delete(itemId);
      }

      toast({
        title: 'Recycle Bin Cleared',
        description: `All ${allItemsToClear.length} documents have been permanently deleted from the recycle bin.`
      });

      setShowClearAllDialog(false);
      setSelectedItems(new Set()); // Clear selection after deletion
      loadDeletedItems(); // Reload list
    } catch (error) {
      console.error('Error clearing recycle bin:', error);
      toast({
        title: 'Clear Operation Failed',
        description: 'Failed to clear the recycle bin. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleRestore = async () => {
    if (!selectedItem) return;

    try {
      const EntityClass = getEntityClass(selectedItem.document_type);
      if (!EntityClass) {
        toast({
          title: 'Error',
          description: 'Unknown document type',
          variant: 'destructive'
        });
        return;
      }

      // Restore the document to its original entity
      // Note: This assumes document_data contains all necessary fields for creation
      await EntityClass.create(selectedItem.document_data);

      // Log the restoration
      await AuditLog.create({
        entity_type: selectedItem.document_type,
        entity_id: selectedItem.document_id,
        action: 'restored',
        user_email: currentUser?.email || 'unknown',
        changes: { restored_from_recycle_bin: true, restore_reason: 'Restored from UI' },
        timestamp: new Date().toISOString()
      });

      // Remove from recycle bin
      await RecycleBin.delete(selectedItem.id);

      toast({
        title: 'Document Restored',
        description: `${selectedItem.document_number} has been restored successfully.`
      });

      setShowRestoreDialog(false);
      setSelectedItem(null);
      loadDeletedItems(); // Reload list to reflect changes
    } catch (error) {
      console.error('Error restoring document:', error);
      toast({
        title: 'Restore Failed',
        description: 'Failed to restore the document. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handlePermanentDelete = async () => {
    if (!selectedItem) return;

    try {
      // Log the permanent deletion
      await AuditLog.create({
        entity_type: selectedItem.document_type,
        entity_id: selectedItem.document_id,
        action: 'permanently_deleted',
        user_email: currentUser?.email || 'unknown',
        changes: { 
          document_number: selectedItem.document_number,
          permanent_deletion_reason: 'Deleted permanently from Recycle Bin',
          original_deletion_reason: selectedItem.reason
        },
        timestamp: new Date().toISOString()
      });

      // Remove from recycle bin permanently
      await RecycleBin.delete(selectedItem.id);

      toast({
        title: 'Document Permanently Deleted',
        description: `${selectedItem.document_number} has been permanently deleted and cannot be recovered.`
      });

      setShowPermanentDeleteDialog(false);
      setSelectedItem(null);
      loadDeletedItems(); // Reload list to reflect changes
    } catch (error) {
      console.error('Error permanently deleting document:', error);
      toast({
        title: 'Deletion Failed',
        description: 'Failed to permanently delete the document. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const filteredItems = deletedItems.filter(item => {
    const matchesSearch = item.document_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.deleted_by.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTab = activeTab === 'all' || item.document_type === activeTab;
    
    return matchesSearch && matchesTab;
  });

  const getTabCounts = () => {
    const counts = deletedItems.reduce((acc, item) => {
      acc[item.document_type] = (acc[item.document_type] || 0) + 1;
      return acc;
    }, {});
    return counts;
  };

  const tabCounts = getTabCounts();

  // Determine checkbox states for select all
  const allSelected = filteredItems.length > 0 && selectedItems.size === filteredItems.length && 
                      filteredItems.every(item => selectedItems.has(item.id));
  const someSelected = selectedItems.size > 0 && selectedItems.size < filteredItems.length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Recycle Bin
          </h3>
          <p className="text-sm text-gray-600">
            Restore or permanently delete documents ({deletedItems.length} items)
          </p>
        </div>

        {/* Bulk Actions */}
        {deletedItems.length > 0 && (
          <div className="flex items-center gap-2">
            {selectedItems.size > 0 && ( // Show "Delete Selected" only if at least one item is selected
              <Button
                variant="outline"
                onClick={() => setShowBulkDeleteDialog(true)}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected ({selectedItems.size})
              </Button>
            )}
            
            <Button
              variant="outline"
              onClick={() => setShowClearAllDialog(true)}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          </div>
        )}
      </div>

      {/* Warning Alert */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-800">Important Information</h4>
            <p className="text-sm text-amber-700 mt-1">
              Documents in the recycle bin can be restored or permanently deleted. 
              Permanent deletion cannot be undone and removes all traces of the document.
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search deleted documents..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">
            All ({deletedItems.length})
          </TabsTrigger>
          <TabsTrigger value="PurchaseOrder">
            Purchase Orders ({tabCounts.PurchaseOrder || 0})
          </TabsTrigger>
          <TabsTrigger value="Invoice">
            Invoices ({tabCounts.Invoice || 0})
          </TabsTrigger>
          <TabsTrigger value="DeliveryOrder">
            Delivery Orders ({tabCounts.DeliveryOrder || 0})
          </TabsTrigger>
          <TabsTrigger value="Quotation">
            Quotations ({tabCounts.Quotation || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected ? true : (someSelected ? "indeterminate" : false)}
                        onCheckedChange={handleSelectAll}
                        disabled={filteredItems.length === 0}
                      />
                    </TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Deleted By</TableHead>
                    <TableHead>Deleted Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedItems.has(item.id)}
                          onCheckedChange={(checked) => handleSelectItem(item.id, checked)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {getDocumentIcon(item.document_type)}
                          {item.document_number}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getDocumentColor(item.document_type)}>
                          {item.document_type.replace(/([A-Z])/g, ' $1').trim()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{item.deleted_by}</TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(item.deleted_date), 'MMM dd, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">
                        {item.reason || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.can_restore ? 'outline' : 'secondary'}>
                          {item.can_restore ? 'Restorable' : 'Locked'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.can_restore && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedItem(item);
                                setShowRestoreDialog(true);
                              }}
                              className="text-green-600 border-green-200 hover:bg-green-50"
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Restore
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedItem(item);
                              setShowPermanentDeleteDialog(true);
                            }}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete Forever
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredItems.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Trash2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Recycle bin is empty</p>
                  <p className="text-sm">Deleted documents will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Restore Dialog */}
      <SimpleConfirmDialog
        open={showRestoreDialog}
        onClose={() => {
          setShowRestoreDialog(false);
          setSelectedItem(null);
        }}
        onConfirm={handleRestore}
        title="Restore Document"
        description={`Do you wish to confirm restoring document "${selectedItem?.document_number}"?`}
        confirmText="Yes, Restore"
      />

      {/* Permanent Delete Dialog */}
      <SimpleConfirmDialog
        open={showPermanentDeleteDialog}
        onClose={() => {
          setShowPermanentDeleteDialog(false);
          setSelectedItem(null);
        }}
        onConfirm={handlePermanentDelete}
        title="Permanently Delete Document"
        description={`Do you wish to confirm permanently deleting "${selectedItem?.document_number}"? This action cannot be undone.`}
        confirmText="Yes, Delete Forever"
        confirmVariant="destructive"
      />

      {/* Bulk Delete Dialog */}
      <SimpleConfirmDialog
        open={showBulkDeleteDialog}
        onClose={() => setShowBulkDeleteDialog(false)}
        onConfirm={handleBulkPermanentDelete}
        title="Permanently Delete Selected Documents"
        description={`Do you wish to confirm permanently deleting ${selectedItems.size} selected documents? This action cannot be undone.`}
        confirmText="Yes, Delete All Selected"
        confirmVariant="destructive"
      />

      {/* Clear All Dialog */}
      <SimpleConfirmDialog
        open={showClearAllDialog}
        onClose={() => setShowClearAllDialog(false)}
        onConfirm={handleClearAll}
        title="Clear Entire Recycle Bin"
        description={`Do you wish to confirm permanently deleting ALL ${filteredItems.length} documents in the recycle bin? This action cannot be undone.`}
        confirmText="Yes, Clear All"
        confirmVariant="destructive"
      />
    </div>
  );
}

// Helper functions moved outside the component as per outline
const getDocumentIcon = (type) => {
  switch (type) {
    case 'PurchaseOrder': return <ShoppingCart className="w-4 h-4" />;
    case 'Invoice': return <FileText className="w-4 h-4" />;
    case 'DeliveryOrder': return <Truck className="w-4 h-4" />;
    case 'Quotation': return <ClipboardList className="w-4 h-4" />;
    default: return <FileText className="w-4 h-4" />;
  }
};

const getDocumentColor = (type) => {
  switch (type) {
    case 'PurchaseOrder': return 'bg-emerald-100 text-emerald-800';
    case 'Invoice': return 'bg-purple-100 text-purple-800';
    case 'DeliveryOrder': return 'bg-amber-100 text-amber-800';
    case 'Quotation': return 'bg-sky-100 text-sky-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getEntityClass = (type) => {
  switch (type) {
    case 'PurchaseOrder': return PurchaseOrder;
    case 'Invoice': return Invoice;
    case 'DeliveryOrder': return DeliveryOrder;
    case 'Quotation': return Quotation;
    default: return null;
  }
};
