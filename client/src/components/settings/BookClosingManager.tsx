
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Lock, Unlock, AlertTriangle, PlusCircle, Download } from 'lucide-react';
import { format, getYear, isValid, parseISO } from 'date-fns';
import { useToast } from "@/hooks/use-toast";

export default function BookClosingManager({ currentUser }: any) {
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newYear, setNewYear] = useState<any>(getYear(new Date()));
  const [validationErrors, setValidationErrors] = useState<any[]>([]);
  const [showValidationError, setShowValidationError] = useState(false);
  const [pendingCloseBook, setPendingCloseBook] = useState<any>(null);
  const [exportingId, setExportingId] = useState<any>(null);
  const { toast } = useToast();

  const formatDate = (dateString: any) => {
    if (!dateString) return '-';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yy') : '-';
    } catch (error: any) {
      return '-';
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/books');
      if (!res.ok) throw new Error('Failed to fetch books');
      const data = await res.json();
      setBooks(data);
    } catch (error: any) {
      console.error("Error fetching books:", error);
      toast({ title: "Error", description: "Could not load financial years.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAddNewYear = async (e: any) => {
    e.preventDefault();
    const year = parseInt(newYear);
    if (isNaN(year) || year < 2000 || year > 2100) {
      toast({ title: "Invalid year", description: "Please enter a valid year between 2000 and 2100.", variant: "destructive" });
      return;
    }
    if (books.some((b: any) => b.year === year)) {
      toast({ title: "Duplicate", description: `Financial year ${year} already exists.`, variant: "destructive" });
      return;
    }
    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, start_date: `${year}-01-01`, end_date: `${year}-12-31` }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create year');
      }
      toast({ title: "Year added", description: `Financial year ${year} created successfully.` });
      fetchBooks();
    } catch (error: any) {
      console.error("Error adding new year:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const validateYearEnd = async (book: any) => {
    const errors: any[] = [];
    const startDate = new Date(book.startDate);
    const endDate = new Date(book.endDate);
    endDate.setHours(23, 59, 59, 999);

    try {
      const [allInvoices, allPOs, allDOs] = await Promise.all([
        fetch('/api/invoices').then(r => r.json()).catch(() => []),
        fetch('/api/purchase-orders').then(r => r.json()).catch(() => []),
        fetch('/api/delivery-orders').then(r => r.json()).catch(() => []),
      ]);

      const inRange = (dateVal: any) => {
        if (!dateVal) return false;
        const d = new Date(dateVal);
        return d >= startDate && d <= endDate;
      };

      const yearInvoices = allInvoices.filter((inv: any) => inRange(inv.invoiceDate || inv.invoice_date));
      const draftInvoices = yearInvoices.filter((inv: any) => inv.status === 'draft');
      if (draftInvoices.length > 0) {
        const first = draftInvoices[0].invoiceNumber || draftInvoices[0].invoice_number || draftInvoices[0].id;
        errors.push(`${draftInvoices.length} Invoice(s) still in Draft. First: ${first}`);
      }

      const yearPOs = allPOs.filter((po: any) => inRange(po.orderDate || po.order_date));
      const openPOs = yearPOs.filter((po: any) => !['closed', 'cancelled'].includes(po.status));
      if (openPOs.length > 0) {
        const first = openPOs[0].poNumber || openPOs[0].po_number || openPOs[0].id;
        errors.push(`${openPOs.length} Purchase Order(s) not Closed. First: ${first}`);
      }

      const yearDOs = allDOs.filter((doOrder: any) => inRange(doOrder.orderDate || doOrder.order_date));
      const openDOs = yearDOs.filter((d: any) => !['delivered', 'cancelled'].includes(d.status));
      if (openDOs.length > 0) {
        const first = openDOs[0].orderNumber || openDOs[0].do_number || openDOs[0].id;
        errors.push(`${openDOs.length} Delivery Order(s) not Delivered. First: ${first}`);
      }
    } catch (error: any) {
      console.error('Validation error:', error);
      errors.push('Could not complete validation. Please try again.');
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const doCloseYear = async (book: any) => {
    setShowValidationError(false);
    setPendingCloseBook(null);
    try {
      const res = await fetch(`/api/books/${book.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Closed' }),
      });
      if (!res.ok) throw new Error('Failed to close year');
      toast({ title: `Year ${book.year} closed`, description: "The financial year has been locked." });
      fetchBooks();
    } catch (error: any) {
      console.error("Error closing year:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleCloseYear = async (book: any) => {
    const ok = await validateYearEnd(book);
    if (!ok) {
      setPendingCloseBook(book);
      setShowValidationError(true);
      return;
    }
    doCloseYear(book);
  };

  const handleReopenYear = async (book: any) => {
    try {
      const res = await fetch(`/api/books/${book.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Open' }),
      });
      if (!res.ok) throw new Error('Failed to reopen year');
      toast({ title: `Year ${book.year} reopened`, description: "The financial year is now open for editing." });
      fetchBooks();
    } catch (error: any) {
      console.error("Error reopening year:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleExportYear = async (book: any) => {
    setExportingId(book.id);
    try {
      const res = await fetch(`/api/books/${book.id}/export`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FLOW_Year_${book.year}_Export.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export ready", description: `Year ${book.year} data exported to Excel.` });
    } catch (error: any) {
      console.error("Error exporting year:", error);
      toast({ title: "Export failed", description: error.message, variant: "destructive" });
    } finally {
      setExportingId(null);
    }
  };

  const getStatusBadge = (status: any) => {
    return status === 'Closed'
      ? <Badge variant="destructive" className="bg-red-100 text-red-800"><Lock className="w-3 h-3 mr-1" />Closed</Badge>
      : <Badge variant="secondary" className="bg-green-100 text-green-800"><Unlock className="w-3 h-3 mr-1" />Open</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Financial Years</CardTitle>
          <CardDescription>Manage financial periods and perform year-end closing.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-gray-500">Loading...</TableCell></TableRow>
              ) : books.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-gray-400">No financial years configured yet. Add one below.</TableCell></TableRow>
              ) : (
                books.map((book: any) => (
                  <TableRow key={book.id}>
                    <TableCell className="font-semibold">{book.year}</TableCell>
                    <TableCell>{formatDate(book.startDate)}</TableCell>
                    <TableCell>{formatDate(book.endDate)}</TableCell>
                    <TableCell>{getStatusBadge(book.status)}</TableCell>
                    <TableCell>
                      {book.status === 'Open' ? (
                        <Button onClick={() => handleCloseYear(book)}  variant="destructive">
                          <Lock className="w-4 h-4 mr-2" />
                          Close Year
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" >
                                <Unlock className="w-4 h-4 mr-2" />
                                Reopen
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reopen year {book.year}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will unlock all documents in this period for editing. Proceed with caution.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleReopenYear(book)}>
                                  Yes, Reopen Year
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <Button
                            variant="secondary"
                            
                            onClick={() => handleExportYear(book)}
                            disabled={exportingId === book.id}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            {exportingId === book.id ? 'Exporting...' : 'Export Year'}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="border-t pt-6">
          <form onSubmit={handleAddNewYear} className="flex items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-year">Add Financial Year</Label>
              <Input
                id="new-year"
                type="number"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
                placeholder="YYYY"
                className="w-32"
              />
            </div>
            <Button type="submit" variant="secondary">
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Year
            </Button>
          </form>
        </CardFooter>
      </Card>

      <AlertDialog open={showValidationError} onOpenChange={setShowValidationError}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-amber-500" />
              Pending Items Before Closing
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>The following items are still pending. Would you still like to proceed with closing the year?</p>
                <ul className="list-disc pl-5 mt-3 space-y-1 text-sm text-gray-700 bg-amber-50 border border-amber-200 p-3 rounded-md">
                  {validationErrors.map((error, i) => <li key={i}>{error}</li>)}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowValidationError(false); setPendingCloseBook(null); }}>
              Go Fix
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => pendingCloseBook && doCloseYear(pendingCloseBook)}
            >
              Close Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
