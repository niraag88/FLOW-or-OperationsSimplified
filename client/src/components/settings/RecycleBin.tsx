
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { RecycleBin } from '@/api/entities';
import SimpleConfirmDialog from '../common/SimpleConfirmDialog';
import TypedConfirmDialog from '../common/TypedConfirmDialog';
import { RECYCLE_BIN_PERMANENT_DELETE_PHRASE } from '@shared/destructiveActionPhrases';

export default function RecycleBinComponent() {
  const [deletedItems, setDeletedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [permanentDeletePending, setPermanentDeletePending] = useState(false);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [clearAllPending, setClearAllPending] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const canPermanentlyDelete = ['Admin', 'Manager'].includes(currentUser?.role || '');

  useEffect(() => {
    loadDeletedItems();
  }, []);

  const loadDeletedItems = async () => {
    setLoading(true);
    try {
      const items = await RecycleBin.list();
      setDeletedItems(items);
    } catch (error: any) {
      console.error('Error loading deleted items:', error);
      setDeletedItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = (itemId: any, checked: any) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = (checked: any) => {
    if (checked) {
      const allIds = filteredItems.map((item: any) => item.id);
      setSelectedItems(new Set(allIds));
    } else {
      setSelectedItems(new Set());
    }
  };

  // Each handler accepts the typed phrase from TypedConfirmDialog and
  // forwards it on every iteration of its loop. The user types the phrase
  // ONCE per dialog opening; the loop then sends that same phrase with
  // every per-row request the server-side guard checks (Task #337).
  const handleBulkPermanentDelete = async (typedPhrase: string) => {
    setBulkDeletePending(true);
    try {
      const itemsToDelete = Array.from(selectedItems);

      for (const itemId of itemsToDelete) {
        await RecycleBin.deletePermanent(itemId as any, typedPhrase);
      }

      toast({
        title: 'Documents Permanently Deleted',
        description: `${itemsToDelete.length} documents have been permanently deleted and cannot be recovered.`
      });

      setShowBulkDeleteDialog(false);
      setSelectedItems(new Set()); // Clear selection after deletion
      loadDeletedItems(); // Reload list
    } catch (error: any) {
      console.error('Error bulk deleting documents:', error);
      toast({
        title: 'Bulk Deletion Failed',
        description: error?.message || 'Failed to permanently delete selected documents. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setBulkDeletePending(false);
    }
  };

  const handleClearAll = async (typedPhrase: string) => {
    setClearAllPending(true);
    try {
      const allItemsToClear = filteredItems.map((item: any) => item.id);

      for (const itemId of allItemsToClear) {
        await RecycleBin.deletePermanent(itemId as any, typedPhrase);
      }

      toast({
        title: 'Recycle Bin Cleared',
        description: `All ${allItemsToClear.length} documents have been permanently deleted from the recycle bin.`
      });

      setShowClearAllDialog(false);
      setSelectedItems(new Set()); // Clear selection after deletion
      loadDeletedItems(); // Reload list
    } catch (error: any) {
      console.error('Error clearing recycle bin:', error);
      toast({
        title: 'Clear Operation Failed',
        description: error?.message || 'Failed to clear the recycle bin. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setClearAllPending(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedItem) return;

    try {
      await RecycleBin.restore(selectedItem.id);

      toast({
        title: 'Document Restored',
        description: `${selectedItem.document_number} has been restored successfully.`
      });

      setShowRestoreDialog(false);
      setSelectedItem(null);
      loadDeletedItems();
    } catch (error: any) {
      console.error('Error restoring document:', error);
      toast({
        title: 'Restore Failed',
        description: 'Failed to restore the document. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handlePermanentDelete = async (typedPhrase: string) => {
    if (!selectedItem) return;

    setPermanentDeletePending(true);
    try {
      await RecycleBin.deletePermanent(selectedItem.id, typedPhrase);

      toast({
        title: 'Document Permanently Deleted',
        description: `${selectedItem.document_number} has been permanently deleted and cannot be recovered.`
      });

      setShowPermanentDeleteDialog(false);
      setSelectedItem(null);
      loadDeletedItems(); // Reload list to reflect changes
    } catch (error: any) {
      console.error('Error permanently deleting document:', error);
      toast({
        title: 'Deletion Failed',
        description: error?.message || 'Failed to permanently delete the document. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setPermanentDeletePending(false);
    }
  };

  const filteredItems = deletedItems.filter((item: any) => {
    const matchesSearch = item.document_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.deleted_by.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTab = activeTab === 'all' || item.document_type === activeTab;
    
    return matchesSearch && matchesTab;
  });

  const getTabCounts = () => {
    const counts = deletedItems.reduce((acc: any, item: any) => {
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

        {/* Bulk Actions — permanent delete only for Admin/Manager */}
        {deletedItems.length > 0 && canPermanentlyDelete && (
          <div className="flex items-center gap-2">
            {selectedItems.size > 0 && (
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
        <div className="w-full overflow-x-auto">
          <TabsList className="grid grid-cols-5 min-w-[540px] sm:min-w-0 sm:w-full">
            <TabsTrigger value="all" className="text-xs sm:text-sm px-2 sm:px-3">
              All ({deletedItems.length})
            </TabsTrigger>
            <TabsTrigger value="PurchaseOrder" className="text-xs sm:text-sm px-2 sm:px-3">
              Purchase Orders ({tabCounts.PurchaseOrder || 0})
            </TabsTrigger>
            <TabsTrigger value="Invoice" className="text-xs sm:text-sm px-2 sm:px-3">
              Invoices ({tabCounts.Invoice || 0})
            </TabsTrigger>
            <TabsTrigger value="DeliveryOrder" className="text-xs sm:text-sm px-2 sm:px-3">
              Delivery Orders ({tabCounts.DeliveryOrder || 0})
            </TabsTrigger>
            <TabsTrigger value="Quotation" className="text-xs sm:text-sm px-2 sm:px-3">
              Quotations ({tabCounts.Quotation || 0})
            </TabsTrigger>
          </TabsList>
        </div>

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
                        {format(new Date(item.deleted_date), 'dd/MM/yy')}
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
                          {canPermanentlyDelete && (
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
                          )}
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

      {/*
        Permanent-delete dialogs (Task #337). All three reuse the same
        TypedConfirmDialog and pass the SAME phrase constant — so the
        admin's typed text is what the server checks before each
        per-row DELETE. Once the server-side guard rejects unphrased
        requests, a stray POST without the phrase can no longer wipe
        a recovery record.
      */}
      <TypedConfirmDialog
        open={showPermanentDeleteDialog}
        onClose={() => {
          setShowPermanentDeleteDialog(false);
          setSelectedItem(null);
        }}
        onConfirm={handlePermanentDelete}
        title="Permanently Delete Document"
        description={
          <>
            <p>
              You are about to <strong>permanently delete</strong>{' '}
              <span className="font-mono">
                {selectedItem?.document_number}
              </span>{' '}
              from the recycle bin.
            </p>
            <p className="text-red-700 font-semibold">
              This cannot be undone — the document will not be recoverable.
            </p>
          </>
        }
        phrase={RECYCLE_BIN_PERMANENT_DELETE_PHRASE}
        confirmLabel="Delete Forever"
        isPending={permanentDeletePending}
        inputTestId="input-recycle-permanent-delete-confirm"
        confirmTestId="button-recycle-permanent-delete-confirm"
      />

      <TypedConfirmDialog
        open={showBulkDeleteDialog}
        onClose={() => setShowBulkDeleteDialog(false)}
        onConfirm={handleBulkPermanentDelete}
        title="Permanently Delete Selected Documents"
        description={
          <>
            <p>
              You are about to <strong>permanently delete</strong>{' '}
              {selectedItems.size} selected{' '}
              {selectedItems.size === 1 ? 'document' : 'documents'} from
              the recycle bin.
            </p>
            <p className="text-red-700 font-semibold">
              This cannot be undone — none of these documents will be
              recoverable.
            </p>
          </>
        }
        phrase={RECYCLE_BIN_PERMANENT_DELETE_PHRASE}
        confirmLabel="Delete All Selected"
        isPending={bulkDeletePending}
        inputTestId="input-recycle-bulk-delete-confirm"
        confirmTestId="button-recycle-bulk-delete-confirm"
      />

      <TypedConfirmDialog
        open={showClearAllDialog}
        onClose={() => setShowClearAllDialog(false)}
        onConfirm={handleClearAll}
        title="Clear Entire Recycle Bin"
        description={
          <>
            <p>
              You are about to <strong>permanently delete ALL</strong>{' '}
              {filteredItems.length}{' '}
              {filteredItems.length === 1 ? 'document' : 'documents'}{' '}
              currently shown in the recycle bin.
            </p>
            <p className="text-red-700 font-semibold">
              This cannot be undone — none of these documents will be
              recoverable.
            </p>
          </>
        }
        phrase={RECYCLE_BIN_PERMANENT_DELETE_PHRASE}
        confirmLabel="Clear All"
        isPending={clearAllPending}
        inputTestId="input-recycle-clear-all-confirm"
        confirmTestId="button-recycle-clear-all-confirm"
      />
    </div>
  );
}

// Helper functions moved outside the component as per outline
const getDocumentIcon = (type: any) => {
  switch (type) {
    case 'PurchaseOrder': return <ShoppingCart className="w-4 h-4" />;
    case 'Invoice': return <FileText className="w-4 h-4" />;
    case 'DeliveryOrder': return <Truck className="w-4 h-4" />;
    case 'Quotation': return <ClipboardList className="w-4 h-4" />;
    default: return <FileText className="w-4 h-4" />;
  }
};

const getDocumentColor = (type: any) => {
  switch (type) {
    case 'PurchaseOrder': return 'bg-emerald-100 text-emerald-800';
    case 'Invoice': return 'bg-purple-100 text-purple-800';
    case 'DeliveryOrder': return 'bg-amber-100 text-amber-800';
    case 'Quotation': return 'bg-sky-100 text-sky-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};
