import type { Express } from "express";
import { suppliers, customers, recycleBin } from "@shared/schema";
import { insertSupplierSchema, insertCustomerSchema } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../middleware";

export function registerSupplierRoutes(app: Express) {
  app.get('/api/suppliers', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await businessStorage.getSuppliers();
      res.json(result);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
  });

  app.post('/api/suppliers', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = insertSupplierSchema.parse(req.body);
      const supplier = await businessStorage.createSupplier(validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(supplier.id), targetType: 'supplier', action: 'CREATE', details: `Supplier '${supplier.name}' created` });
      res.status(201).json(supplier);
    } catch (error) {
      console.error('Error creating supplier:', error);
      res.status(500).json({ error: 'Failed to create supplier' });
    }
  });

  app.put('/api/suppliers/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const supplierId = parseInt(req.params.id);
      const validatedData = insertSupplierSchema.partial().parse(req.body);
      const supplier = await businessStorage.updateSupplier(supplierId, validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(supplierId), targetType: 'supplier', action: 'UPDATE', details: `Supplier '${supplier.name}' updated` });
      res.json(supplier);
    } catch (error) {
      console.error('Error updating supplier:', error);
      res.status(500).json({ error: 'Failed to update supplier' });
    }
  });

  app.delete('/api/suppliers/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const supplierId = parseInt(req.params.id);
      const [supplierToDelete] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
      if (!supplierToDelete) return res.status(404).json({ error: 'Supplier not found' });
      await db.insert(recycleBin).values({
        documentType: 'Supplier',
        documentId: String(supplierId),
        documentNumber: supplierToDelete.name,
        documentData: JSON.stringify({ header: supplierToDelete, items: [] }),
        deletedBy: req.user?.username || 'unknown',
        deletedDate: new Date(),
        reason: 'Deleted from UI',
        originalStatus: supplierToDelete.isActive ? 'Active' : 'Inactive',
        canRestore: true,
      });
      await businessStorage.deleteSupplier(supplierId);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(supplierId), targetType: 'supplier', action: 'DELETE', details: `Supplier '${supplierToDelete.name}' moved to recycle bin` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting supplier:', error);
      res.status(500).json({ error: 'Failed to delete supplier' });
    }
  });

  app.get('/api/customers', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await businessStorage.getCustomers();
      res.json(result);
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  app.post('/api/customers', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await businessStorage.createCustomer(validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(customer.id), targetType: 'customer', action: 'CREATE', details: `Customer '${customer.name}' created` });
      res.status(201).json(customer);
    } catch (error) {
      console.error('Error creating customer:', error);
      res.status(500).json({ error: 'Failed to create customer' });
    }
  });

  app.put('/api/customers/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const customerId = parseInt(req.params.id);
      const validatedData = insertCustomerSchema.partial().parse(req.body);
      const customer = await businessStorage.updateCustomer(customerId, validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(customerId), targetType: 'customer', action: 'UPDATE', details: `Customer '${customer.name}' updated` });
      res.json(customer);
    } catch (error) {
      console.error('Error updating customer:', error);
      res.status(500).json({ error: 'Failed to update customer' });
    }
  });

  app.delete('/api/customers/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const customerId = parseInt(req.params.id);
      const [customerToDelete] = await db.select().from(customers).where(eq(customers.id, customerId));
      if (!customerToDelete) return res.status(404).json({ error: 'Customer not found' });
      await db.insert(recycleBin).values({
        documentType: 'Customer',
        documentId: String(customerId),
        documentNumber: customerToDelete.name,
        documentData: JSON.stringify({ header: customerToDelete, items: [] }),
        deletedBy: req.user?.username || 'unknown',
        deletedDate: new Date(),
        reason: 'Deleted from UI',
        originalStatus: customerToDelete.isActive ? 'Active' : 'Inactive',
        canRestore: true,
      });
      await db.delete(customers).where(eq(customers.id, customerId));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(customerId), targetType: 'customer', action: 'DELETE', details: `Customer '${customerToDelete.name}' moved to recycle bin` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting customer:', error);
      res.status(500).json({ error: 'Failed to delete customer' });
    }
  });
}
