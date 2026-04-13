import type { Express } from "express";
import { ZodError } from 'zod';
import { customers, recycleBin } from "@shared/schema";
import { insertCustomerSchema } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../middleware";

export function registerCustomerRoutes(app: Express) {
  app.get('/api/customers/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) return res.status(400).json({ error: 'Invalid ID' });
      const customer = await businessStorage.getCustomerById(customerId);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      res.json(customer);
    } catch (error) {
      console.error('Error fetching customer:', error);
      res.status(500).json({ error: 'Failed to fetch customer' });
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
      if (error instanceof ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
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
