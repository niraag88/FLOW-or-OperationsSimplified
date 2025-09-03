
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Lock, Unlock, FileArchive, AlertTriangle, PlusCircle, Download } from 'lucide-react';
import { Books } from '@/api/entities';
import { PurchaseOrder } from '@/api/entities';
import { DeliveryOrder } from '@/api/entities';
import { Invoice } from '@/api/entities';
import { AuditLog } from '@/api/entities';
import { format, getYear, isValid, parseISO } from 'date-fns';
import { useToast } from "@/components/ui/use-toast";

export default function BookClosingManager({ currentUser }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newYear, setNewYear] = useState(getYear(new Date()));
  const [validationErrors, setValidationErrors] = useState([]);
  const [showValidationError, setShowValidationError] = useState(false);
  const { toast } = useToast();

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yy') : '-';
    } catch (error) {
      console.error('Date formatting error:', error);
      return '-';
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    setLoading(true);
    try {
      const bookData = await Books.list('-year');
      setBooks(bookData);
    } catch (error) {
      console.error("Error fetching books:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNewYear = async (e) => {
    e.preventDefault();
    const year = parseInt(newYear);
    if (isNaN(year) || books.some(b => b.year === year)) {
      alert("Invalid or duplicate year.");
      return;
    }

    try {
      await Books.create({
        year: year,
        start_date: `${year}-01-01`,
        end_date: `${year}-12-31`,
        status: "Open",
      });
      fetchBooks();
    } catch (error) {
      console.error("Error adding new year:", error);
    }
  };

  const validateYearEnd = async (book) => {
    const errors = [];
    const { start_date, end_date } = book;

    const allPOs = await PurchaseOrder.filter({ order_date: { $gte: start_date, $lte: end_date } });
    const openPOs = allPOs.filter(po => po.status !== 'closed');
    if (openPOs.length > 0) {
      errors.push(`- ${openPOs.length} Purchase Order(s) are not 'Closed'. First PO: ${openPOs[0].po_number}`);
    }

    const allDOs = await DeliveryOrder.filter({ order_date: { $gte: start_date, $lte: end_date } });
    const openDOs = allDOs.filter(d => d.status !== 'delivered');
    if (openDOs.length > 0) {
      errors.push(`- ${openDOs.length} Delivery Order(s) are not 'Delivered'. First DO: ${openDOs[0].do_number}`);
    }

    const allInvoices = await Invoice.filter({ invoice_date: { $gte: start_date, $lte: end_date } });
    const draftInvoices = allInvoices.filter(inv => inv.status === 'draft');
    if (draftInvoices.length > 0) {
      errors.push(`- ${draftInvoices.length} Invoice(s) are in 'Draft' status. First Invoice: ${draftInvoices[0].invoice_number}`);
    }
    
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleCloseYear = async (book) => {
    const isValid = await validateYearEnd(book);
    if (!isValid) {
      setShowValidationError(true);
      return;
    }

    try {
      // NOTE: Snapshot generation is a backend task. We simulate it here.
      await Books.update(book.id, { 
        status: 'Closed',
        snapshot_path: `/archives/snapshot_${book.year}.zip` // Mock path
      });
      
      await AuditLog.create({
        entity_type: "Books",
        entity_id: book.id,
        action: "close_year",
        user_email: currentUser.email,
        changes: { year: book.year, status: "Closed" },
        timestamp: new Date().toISOString()
      });

      fetchBooks();
    } catch (error) {
      console.error("Error closing year:", error);
    }
  };

  const handleReopenYear = async (book) => {
     try {
      await Books.update(book.id, { status: 'Open', snapshot_path: null });
      
      await AuditLog.create({
        entity_type: "Books",
        entity_id: book.id,
        action: "reopen_year",
        user_email: currentUser.email,
        changes: { year: book.year, status: "Open" },
        timestamp: new Date().toISOString()
      });
      
      fetchBooks();
    } catch (error) {
      console.error("Error reopening year:", error);
    }
  };

  const handleGenerateSnapshot = async (book) => {
    toast({
        title: `Generating Snapshot for ${book.year}...`,
        description: "This is a backend process and may take several minutes. You will be notified on completion.",
    });

    try {
        await AuditLog.create({
            entity_type: "Books",
            entity_id: book.id,
            action: "generate_snapshot",
            user_email: currentUser.email,
            changes: { year: book.year },
            timestamp: new Date().toISOString()
        });

        // Simulate backend process and update UI
        // In a real app, this would be handled by a webhook or polling
        setTimeout(async () => {
            const snapshotPath = `/books/${book.year}/snapshot_${Date.now()}.zip`;
            await Books.update(book.id, { snapshot_path: snapshotPath });
            fetchBooks(); // Refresh the list
            toast({
                title: "Snapshot Generated",
                description: `Successfully generated snapshot for ${book.year}.`
            });
        }, 5000);

    } catch (error) {
        console.error("Error initiating snapshot generation:", error);
    }
  };

  const getStatusBadge = (status) => {
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
                <TableRow><TableCell colSpan="5" className="text-center">Loading...</TableCell></TableRow>
              ) : (
                books.map(book => (
                  <TableRow key={book.id}>
                    <TableCell className="font-semibold">{book.year}</TableCell>
                    <TableCell>{formatDate(book.start_date)}</TableCell>
                    <TableCell>{formatDate(book.end_date)}</TableCell>
                    <TableCell>{getStatusBadge(book.status)}</TableCell>
                    <TableCell>
                      {book.status === 'Open' ? (
                        <Button onClick={() => handleCloseYear(book)} size="sm">
                          <Lock className="w-4 h-4 mr-2"/>
                          Close Year
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                           <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Unlock className="w-4 h-4 mr-2"/>
                                Reopen
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure you want to reopen the year {book.year}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Reopening a closed year will unlock all associated documents for editing. This is a critical action and should be done with caution.
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
                             size="sm"
                             onClick={() => handleGenerateSnapshot(book)}
                           >
                              <FileArchive className="w-4 h-4 mr-2"/>
                              Generate Snapshot
                           </Button>
                           {book.snapshot_path && (
                             <Button variant="outline" size="sm" asChild>
                               <a href={book.snapshot_path} target="_blank" rel="noreferrer">
                                <Download className="w-4 h-4 mr-2"/>
                                Download
                               </a>
                            </Button>
                           )}
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
               <AlertTriangle className="text-red-500"/>
              Year-End Validation Failed
            </AlertDialogTitle>
            <AlertDialogDescription>
              The financial year cannot be closed due to the following open items. Please resolve them before proceeding.
              <ul className="list-disc pl-5 mt-4 text-sm text-gray-700 bg-gray-50 p-3 rounded-md">
                {validationErrors.map((error, i) => <li key={i}>{error}</li>)}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowValidationError(false)}>Acknowledge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Alert>
          <FileArchive className="h-4 w-4" />
          <AlertTitle>Note on Snapshots</AlertTitle>
          <AlertDescription>
            Closing a year locks all records for data integrity. The actual generation of a downloadable snapshot (.zip archive) is a backend process. This feature can be fully enabled with backend functions.
          </AlertDescription>
      </Alert>

    </div>
  );
}
