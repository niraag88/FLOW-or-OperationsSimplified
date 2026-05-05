import type { Express } from "express";
import ExcelJS from 'exceljs';
import { ZodError } from 'zod';
import { products, recycleBin, stockMovements } from "@shared/schema";
import { insertProductSchema } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../middleware";
import { logger } from "../logger";

export function registerProductRoutes(app: Express) {
  app.get('/api/products/filter-options', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await businessStorage.getProductFilterOptions();
      res.json(result);
    } catch (error) {
      logger.error('Error fetching product filter options:', error);
      res.status(500).json({ error: 'Failed to fetch filter options' });
    }
  });

  app.get('/api/products/stock-analysis', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      let lowStockThreshold: number;
      if (req.query.threshold) {
        const parsed = parseInt(String(req.query.threshold), 10);
        lowStockThreshold = Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
      } else {
        const settings = await businessStorage.getCompanySettings();
        lowStockThreshold = settings?.lowStockThreshold ?? 6;
      }
      const stockData = await businessStorage.getProductsWithStockAnalysis(lowStockThreshold);
      res.json(stockData);
    } catch (error) {
      logger.error('Error fetching stock analysis:', error);
      res.status(500).json({ error: 'Failed to fetch stock analysis' });
    }
  });

  app.get('/api/products/bulk-template', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const allBrands = await businessStorage.getBrands();
      const activeNames = allBrands.filter((b: any) => b.isActive !== false).map((b: any) => b.name);

      const wb = new ExcelJS.Workbook();
      wb.creator = 'FLOW';
      wb.created = new Date();

      const brandSheet = wb.addWorksheet('_Brands', { state: 'veryHidden' });
      activeNames.forEach((name: string, i: number) => {
        brandSheet.getCell(i + 1, 1).value = name;
      });

      const SUPPORTED_CURRENCIES = ['AED', 'GBP', 'USD', 'INR'];
      const currencySheet = wb.addWorksheet('_Currencies', { state: 'veryHidden' });
      SUPPORTED_CURRENCIES.forEach((c, i) => {
        currencySheet.getCell(i + 1, 1).value = c;
      });

      const ws = wb.addWorksheet('Products');

      ws.columns = [
        { header: 'Brand Name', key: 'brand', width: 22 },
        { header: 'Product Code', key: 'code', width: 16 },
        { header: 'Product Name', key: 'name', width: 32 },
        { header: 'Size', key: 'size', width: 12 },
        { header: 'Purchase Price', key: 'purchasePrice', width: 16 },
        { header: 'Purchase Price Currency', key: 'purchaseCurrency', width: 24 },
        { header: 'Sale Price (AED)', key: 'salePrice', width: 16 },
      ];

      const headerRow = ws.getRow(1);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFCBCBCB' } },
        };
      });
      headerRow.height = 20;

      ws.addRow({
        brand: activeNames[0] || 'My Brand',
        code: 'MYSKU001',
        name: 'Example Product',
        size: '250ml',
        purchasePrice: 5.00,
        purchaseCurrency: 'GBP',
        salePrice: 25.00,
      });
      const exampleRow = ws.getRow(2);
      exampleRow.eachCell(cell => {
        cell.font = { italic: true, color: { argb: 'FF9CA3AF' } };
      });

      const DATA_ROWS = 500;

      ws.getColumn(2).numFmt = '@';
      ws.getCell(2, 2).numFmt = '@';

      if (activeNames.length > 0) {
        for (let r = 3; r <= DATA_ROWS + 2; r++) {
          ws.getCell(r, 1).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`_Brands!$A$1:$A$${activeNames.length}`],
            showErrorMessage: true,
            errorTitle: 'Invalid Brand',
            error: 'Please select a brand from the list.',
          };
        }
      }

      for (let r = 3; r <= DATA_ROWS + 2; r++) {
        ws.getCell(r, 6).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['_Currencies!$A$1:$A$4'],
          showErrorMessage: true,
          errorTitle: 'Invalid Currency',
          error: `Must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
        };
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="bulk-add-products-template.xlsx"');
      res.setHeader('Cache-Control', 'no-cache');

      await wb.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('Error generating bulk template:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to generate template' });
    }
  });

  app.post('/api/products/bulk', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const rows: Array<{
        brandName: string;
        productCode: string;
        productName: string;
        size?: string;
        purchasePrice?: string;
        purchasePriceCurrency?: string;
        salePrice: string;
      }> = req.body.rows;

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'No rows provided' });
      }

      const allBrands = await businessStorage.getBrands();
      const brandMap = new Map<string, number>();
      for (const b of allBrands) {
        brandMap.set(b.name.trim().toLowerCase(), b.id);
      }

      const existingSkuRows = await db.select({ sku: products.sku }).from(products);
      const existingSkus = new Set(existingSkuRows.map(r => r.sku?.toUpperCase()));

      const preValidated: Array<{
        row: number; sku: string; brandId: number; name: string;
        size: string | null; costPrice: string; costPriceCurrency: string; unitPrice: string;
      }> = [];
      const failed: Array<{ row: number; sku: string; message: string }> = [];
      const seenSkus = new Set<string>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1;

        const brandId = brandMap.get((row.brandName || '').trim().toLowerCase());
        const sku = (row.productCode || '').trim().toUpperCase();
        const name = (row.productName || '').trim();
        const salePrice = row.salePrice;

        if (!brandId) {
          failed.push({ row: rowNum, sku, message: `Brand "${row.brandName}" not found` });
          continue;
        }
        if (!sku) {
          failed.push({ row: rowNum, sku, message: 'Product code is required' });
          continue;
        }
        if (!name) {
          failed.push({ row: rowNum, sku, message: 'Product name is required' });
          continue;
        }
        if (!salePrice && salePrice !== '0') {
          failed.push({ row: rowNum, sku, message: 'Sale price is required' });
          continue;
        }
        const salePriceNum = parseFloat(salePrice);
        if (isNaN(salePriceNum) || salePriceNum < 0) {
          failed.push({ row: rowNum, sku, message: 'Sale price must be a valid non-negative number' });
          continue;
        }
        if (row.purchasePrice) {
          const purchasePriceNum = parseFloat(row.purchasePrice);
          if (isNaN(purchasePriceNum) || purchasePriceNum < 0) {
            failed.push({ row: rowNum, sku, message: 'Purchase price must be a valid non-negative number' });
            continue;
          }
        }
        const validCurrencies = ['AED', 'GBP', 'USD', 'INR'];
        const currency = (row.purchasePriceCurrency || 'GBP').toUpperCase();
        if (!validCurrencies.includes(currency)) {
          failed.push({ row: rowNum, sku, message: `Purchase currency must be one of: ${validCurrencies.join(', ')}` });
          continue;
        }
        const skuPattern = /^[A-Za-z0-9-]{1,50}$/;
        if (!skuPattern.test(sku)) {
          failed.push({ row: rowNum, sku, message: 'Product code must be 1–50 letters and numbers only' });
          continue;
        }
        if (existingSkus.has(sku)) {
          failed.push({ row: rowNum, sku, message: `Product code "${sku}" already exists` });
          continue;
        }
        if (seenSkus.has(sku)) {
          failed.push({ row: rowNum, sku, message: `Duplicate product code "${sku}" in this import` });
          continue;
        }

        seenSkus.add(sku);
        preValidated.push({
          row: rowNum,
          sku,
          brandId,
          name,
          size: (row.size || '').trim() || null,
          costPrice: row.purchasePrice || '0',
          costPriceCurrency: row.purchasePriceCurrency || 'GBP',
          unitPrice: salePrice,
        });
      }

      const createdProducts: any[] = [];
      if (preValidated.length > 0) {
        await db.transaction(async (tx) => {
          for (const item of preValidated) {
            try {
              // Per-row savepoint: a unique-constraint clash on this
              // row rolls back only the savepoint, leaving the outer
              // tx alive so the rest of the batch can still land.
              await tx.transaction(async (sp) => {
                const [product] = await sp.insert(products).values({
                  sku: item.sku,
                  brandId: item.brandId,
                  name: item.name,
                  size: item.size,
                  costPrice: item.costPrice,
                  costPriceCurrency: item.costPriceCurrency,
                  unitPrice: item.unitPrice,
                  stockQuantity: 0,
                  minStockLevel: 10,
                  isActive: true,
                }).returning();
                createdProducts.push(product);
              });
            } catch (err) {
              const code = (err as { code?: string } | null)?.code;
              if (code === '23505') {
                // Concurrent bulk import landed the same SKU between
                // our pre-check and this insert — surface the same
                // friendly message the pre-check would have produced.
                failed.push({
                  row: item.row,
                  sku: item.sku,
                  message: `Product code "${item.sku}" already exists`,
                });
                continue;
              }
              throw err;
            }
          }
        });

        for (const product of createdProducts) {
          writeAuditLog({
            actor: req.user!.id,
            actorName: req.user?.username || String(req.user!.id),
            targetId: String(product.id),
            targetType: 'product',
            action: 'CREATE',
            details: `Product '${product.name}' (SKU: ${product.sku}) created via bulk import`,
          });
        }
      }

      res.status(201).json({ created: createdProducts.length, failed: failed.length, errors: failed });
    } catch (error) {
      logger.error('Error bulk-creating products:', error);
      res.status(500).json({ error: 'Failed to bulk-create products' });
    }
  });

  app.get('/api/products', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      if (req.query.sku) {
        const all = await businessStorage.getProducts();
        const arr = Array.isArray(all) ? all : (all as any).data ?? [];
        return res.json(arr.filter((p: any) => p.sku === req.query.sku));
      }

      const page = req.query.page ? parseInt(String(req.query.page)) : undefined;
      const pageSize = req.query.pageSize ? parseInt(String(req.query.pageSize)) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const category = req.query.category ? String(req.query.category) : undefined;
      const brandParam = req.query.brand ? String(req.query.brand) : undefined;
      const sizeParam = req.query.size ? String(req.query.size) : undefined;
      const brandNames = brandParam ? brandParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;
      const sizes = sizeParam ? sizeParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;

      const result = await businessStorage.getProducts({ page, pageSize, search, category, brandNames, sizes });
      res.json(result);
    } catch (error) {
      logger.error('Error fetching products:', error);
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  app.post('/api/products', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = insertProductSchema.parse(req.body);
      const product = await businessStorage.createProduct(validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(product.id), targetType: 'product', action: 'CREATE', details: `Product '${product.name}' (SKU: ${product.sku}) created` });
      res.status(201).json(product);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      logger.error('Error creating product:', error);
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

  app.get('/api/products/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await businessStorage.getProductById(productId);

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json(product);
    } catch (error) {
      logger.error('Error fetching product:', error);
      res.status(500).json({ error: 'Failed to fetch product' });
    }
  });

  app.put('/api/products/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      const validatedData = insertProductSchema.partial().parse(req.body);
      const product = await businessStorage.updateProduct(productId, validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(productId), targetType: 'product', action: 'UPDATE', details: `Product '${product.name}' updated` });
      res.json(product);
    } catch (error) {
      logger.error('Error updating product:', error);
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  app.delete('/api/products/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      const [productToDelete] = await db.select().from(products).where(eq(products.id, productId));
      if (!productToDelete) return res.status(404).json({ error: 'Product not found' });

      // Task #365 (RF-2) audit: this handler already wraps the
      // recycle-bin insert and the live delete in a single
      // transaction, and on FK error (pgCode 23503) it falls back to
      // deactivation instead of returning an error. No change needed.
      let binEntryId: number | null = null;
      try {
        await db.transaction(async (tx) => {
          const [binEntry] = await tx.insert(recycleBin).values({
            documentType: 'Product',
            documentId: String(productId),
            documentNumber: productToDelete.sku || String(productId),
            documentData: JSON.stringify({ header: productToDelete, items: [] }),
            deletedBy: req.user?.username || 'unknown',
            deletedDate: new Date(),
            reason: 'Deleted from UI',
            originalStatus: productToDelete.isActive ? 'Active' : 'Inactive',
            canRestore: true,
          }).returning({ id: recycleBin.id });
          binEntryId = binEntry.id;
          await tx.delete(stockMovements).where(eq(stockMovements.productId, productId));
          await tx.delete(products).where(eq(products.id, productId));
        });
      } catch (deleteErr) {
        const cause = (deleteErr instanceof Object && 'cause' in deleteErr) ? (deleteErr as Record<string, unknown>).cause : undefined;
        const pgCode = (deleteErr instanceof Object && 'code' in deleteErr)
          ? String((deleteErr as Record<string, unknown>).code)
          : (cause instanceof Object && 'code' in cause ? String((cause as Record<string, unknown>).code) : '');
        if (pgCode === '23503') {
          await db.update(products).set({ isActive: false }).where(eq(products.id, productId));
          writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(productId), targetType: 'product', action: 'DEACTIVATE', details: `Product '${productToDelete?.name || productId}' (SKU: ${productToDelete?.sku || '?'}) deactivated (has order history)` });
          return res.json({ success: true, message: 'Product deactivated (has order history)' });
        }
        throw deleteErr;
      }
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(productId), targetType: 'product', action: 'DELETE', details: `Product '${productToDelete?.name || productId}' (SKU: ${productToDelete?.sku || '?'}) soft-deleted to recycle bin (bin id: ${binEntryId})` });
      res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
      logger.error('Error deleting product:', error);
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  app.post('/api/products/:id/adjust-stock', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      if (isNaN(productId)) {
        return res.status(400).json({ error: 'Invalid product ID' });
      }

      const { adjustmentType, quantity, reason, referenceDocument } = req.body;

      if (!adjustmentType || !['increase', 'decrease', 'correction'].includes(adjustmentType)) {
        return res.status(400).json({ error: 'adjustmentType must be "increase", "decrease", or "correction"' });
      }
      const qty = parseFloat(quantity);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: 'quantity must be a positive number' });
      }
      if (!reason || !String(reason).trim()) {
        return res.status(400).json({ error: 'reason is required' });
      }

      // Lock the product row inside the tx and recompute newStock
      // from the locked snapshot so two concurrent adjustments
      // (e.g. +10 and +5) both apply instead of silently clobbering.
      type AdjustResult =
        | { kind: 'ok'; product: typeof products.$inferSelect; previousStock: number; newStock: number; quantityChange: number }
        | { kind: 'not_found' }
        | { kind: 'no_change' };

      const result = await db.transaction(async (tx): Promise<AdjustResult> => {
        const [product] = await tx.select().from(products)
          .where(eq(products.id, productId))
          .for('update')
          .limit(1);
        if (!product) {
          return { kind: 'not_found' };
        }

        const previousStock = product.stockQuantity ?? 0;
        let newStock: number;
        let quantityChange: number;

        switch (adjustmentType) {
          case 'increase':
            quantityChange = Math.round(qty);
            newStock = previousStock + quantityChange;
            break;
          case 'decrease':
            quantityChange = -Math.round(qty);
            newStock = Math.max(0, previousStock + quantityChange);
            quantityChange = newStock - previousStock;
            break;
          case 'correction':
          default:
            newStock = Math.max(0, Math.round(qty));
            quantityChange = newStock - previousStock;
            break;
        }

        if (quantityChange === 0) {
          return { kind: 'no_change' };
        }

        await tx.update(products)
          .set({ stockQuantity: newStock, updatedAt: new Date() })
          .where(eq(products.id, productId));

        await tx.insert(stockMovements).values({
          productId,
          movementType: 'adjustment',
          referenceId: null,
          referenceType: 'manual',
          quantity: quantityChange,
          previousStock,
          newStock,
          unitCost: null,
          notes: `${adjustmentType.charAt(0).toUpperCase() + adjustmentType.slice(1)} adjustment: ${reason.trim()}${referenceDocument ? ` | Ref: ${referenceDocument.trim()}` : ''}`,
          createdBy: req.user!.id,
        });

        return { kind: 'ok', product, previousStock, newStock, quantityChange };
      });

      if (result.kind === 'not_found') {
        return res.status(404).json({ error: 'Product not found' });
      }
      if (result.kind === 'no_change') {
        return res.status(400).json({ error: 'Adjustment results in no stock change. Current stock is already at the requested level.' });
      }

      const { product, previousStock, newStock, quantityChange } = result;

      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: String(productId),
        targetType: 'product',
        action: 'UPDATE',
        details: `Stock adjusted for '${product.name}' (SKU: ${product.sku}): ${adjustmentType} by ${Math.abs(quantityChange)} — ${previousStock} → ${newStock}. Reason: ${reason.trim()}`
      });

      res.json({
        success: true,
        previousStock,
        newStock,
        quantityChange,
        productId,
        productName: product.name,
      });
    } catch (error) {
      logger.error('Error adjusting stock:', error);
      res.status(500).json({ error: 'Failed to adjust stock' });
    }
  });
}
