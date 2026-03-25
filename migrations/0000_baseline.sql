CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"actor_name" text,
	"target_id" text NOT NULL,
	"target_type" text NOT NULL,
	"object_key" text,
	"action" text NOT NULL,
	"details" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo" text,
	"website" text,
	"contact_person" text,
	"contact_email" text,
	"contact_phone" text,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brands_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"website" text,
	"vat_number" text,
	"tax_number" text,
	"logo" text,
	"currency" text DEFAULT 'USD',
	"vat_enabled" boolean DEFAULT true,
	"default_vat_rate" numeric(5, 2) DEFAULT '0.00',
	"low_stock_threshold" integer DEFAULT 6,
	"fx_gbp_to_aed" numeric(8, 4) DEFAULT '4.8500',
	"fx_usd_to_aed" numeric(8, 4) DEFAULT '3.6725',
	"fx_inr_to_aed" numeric(8, 4) DEFAULT '0.0440',
	"po_number_prefix" text DEFAULT 'PO',
	"do_number_prefix" text DEFAULT 'DO',
	"invoice_number_prefix" text DEFAULT 'INV',
	"grn_number_prefix" text DEFAULT 'GRN',
	"quotation_number_prefix" text DEFAULT 'QUO',
	"next_po_number" integer DEFAULT 1,
	"next_do_number" integer DEFAULT 1,
	"next_invoice_number" integer DEFAULT 1,
	"next_grn_number" integer DEFAULT 1,
	"next_quotation_number" integer DEFAULT 1,
	"updated_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"warn_at_percent" integer DEFAULT 80,
	"critical_at_percent" integer DEFAULT 90
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"email" text,
	"phone" text,
	"billing_address" text,
	"shipping_address" text,
	"vat_number" text,
	"vat_treatment" text DEFAULT 'standard',
	"payment_terms" text DEFAULT '30',
	"credit_limit" numeric(10, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"do_id" integer NOT NULL,
	"product_id" integer,
	"brand_id" integer,
	"product_code" text,
	"description" text DEFAULT '' NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"line_total" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_id" integer,
	"delivery_address" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"order_date" date,
	"reference" text,
	"reference_date" date,
	"subtotal" numeric(10, 2),
	"tax_amount" numeric(10, 2),
	"total_amount" numeric(10, 2),
	"currency" text DEFAULT 'AED',
	"notes" text,
	"tax_rate" numeric(5, 4),
	"tax_treatment" text DEFAULT 'standard',
	"object_key" text,
	"scan_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"legal_hold" boolean DEFAULT false NOT NULL,
	CONSTRAINT "delivery_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "financial_years" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"status" text DEFAULT 'Open' NOT NULL,
	CONSTRAINT "financial_years_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_id" integer NOT NULL,
	"po_item_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"ordered_quantity" integer NOT NULL,
	"received_quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"receipt_number" text NOT NULL,
	"po_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"received_date" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"scan_key_1" text,
	"scan_key_2" text,
	"scan_key_3" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "goods_receipts_receipt_number_unique" UNIQUE("receipt_number")
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"product_id" integer,
	"brand_id" integer,
	"product_code" text,
	"description" text DEFAULT '' NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"line_total" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_id" integer,
	"amount" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"invoice_date" date,
	"reference" text,
	"reference_date" date,
	"vat_amount" text,
	"notes" text,
	"currency" text DEFAULT 'AED',
	"tax_treatment" text DEFAULT 'standard',
	"payment_method" text,
	"object_key" text,
	"scan_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"legal_hold" boolean DEFAULT false NOT NULL,
	"payment_status" text DEFAULT 'outstanding' NOT NULL,
	"payment_received_date" date,
	"payment_remarks" text,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"brand_id" integer,
	"category" text,
	"size" text,
	"unit_price" numeric(10, 2) NOT NULL,
	"cost_price" numeric(10, 2),
	"cost_price_currency" text DEFAULT 'GBP',
	"vat_rate" numeric(5, 2) DEFAULT '0.00',
	"unit" text DEFAULT 'pcs',
	"stock_quantity" integer DEFAULT 0,
	"min_stock_level" integer DEFAULT 10,
	"max_stock_level" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT '0.00',
	"line_total" numeric(10, 2) NOT NULL,
	"received_quantity" integer DEFAULT 0,
	"description_override" text,
	"size_override" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_number" text NOT NULL,
	"supplier_id" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"order_date" timestamp DEFAULT now() NOT NULL,
	"expected_delivery" timestamp,
	"total_amount" numeric(10, 2) DEFAULT '0.00',
	"vat_amount" numeric(10, 2) DEFAULT '0.00',
	"grand_total" numeric(10, 2) DEFAULT '0.00',
	"notes" text,
	"currency" text DEFAULT 'GBP',
	"fx_rate_to_aed" numeric(8, 4) DEFAULT '4.8500',
	"object_key" text,
	"supplier_scan_key" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"payment_status" text DEFAULT 'outstanding' NOT NULL,
	"payment_made_date" date,
	"payment_remarks" text,
	CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"discount" numeric(5, 2) DEFAULT '0.00',
	"vat_rate" numeric(5, 2) DEFAULT '0.00',
	"line_total" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_number" text NOT NULL,
	"customer_id" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"quote_date" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT '0.00',
	"vat_amount" numeric(10, 2) DEFAULT '0.00',
	"grand_total" numeric(10, 2) DEFAULT '0.00',
	"notes" text,
	"show_remarks" boolean DEFAULT false,
	"terms" text,
	"reference" text,
	"reference_date" timestamp,
	"object_key" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_quote_number_unique" UNIQUE("quote_number")
);
--> statement-breakpoint
CREATE TABLE "recycle_bin" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_type" text NOT NULL,
	"document_id" text NOT NULL,
	"document_number" text NOT NULL,
	"document_data" text NOT NULL,
	"deleted_by" text NOT NULL,
	"deleted_date" timestamp DEFAULT now() NOT NULL,
	"reason" text,
	"original_status" text,
	"can_restore" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signed_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"expires" bigint NOT NULL,
	"type" text NOT NULL,
	"content_type" text,
	"file_size" integer,
	"checksum" text
);
--> statement-breakpoint
CREATE TABLE "stock_count_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_count_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_code" text NOT NULL,
	"brand_name" text,
	"product_name" text NOT NULL,
	"size" text,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"count_date" timestamp DEFAULT now() NOT NULL,
	"total_products" integer NOT NULL,
	"total_quantity" integer NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"movement_type" text NOT NULL,
	"reference_id" integer,
	"reference_type" text,
	"quantity" integer NOT NULL,
	"previous_stock" integer NOT NULL,
	"new_stock" integer NOT NULL,
	"unit_cost" numeric(10, 2),
	"notes" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_monitoring" (
	"id" serial PRIMARY KEY NOT NULL,
	"database_size" bigint NOT NULL,
	"object_storage_size" bigint DEFAULT 0,
	"total_documents" integer DEFAULT 0,
	"backup_status" text DEFAULT 'pending',
	"last_backup" timestamp,
	"retention_days" integer DEFAULT 2555,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_objects" (
	"key" text PRIMARY KEY NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"email" text,
	"phone" text,
	"address" text,
	"vat_number" text,
	"payment_terms" text DEFAULT '30',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'Staff' NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login" timestamp,
	"created_by" varchar,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vat_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_sales" numeric(10, 2) DEFAULT '0.00',
	"total_purchases" numeric(10, 2) DEFAULT '0.00',
	"vat_collected" numeric(10, 2) DEFAULT '0.00',
	"vat_paid" numeric(10, 2) DEFAULT '0.00',
	"net_vat" numeric(10, 2) DEFAULT '0.00',
	"submitted_date" timestamp,
	"object_key" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_do_id_delivery_orders_id_fk" FOREIGN KEY ("do_id") REFERENCES "public"."delivery_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_po_item_id_purchase_order_items_id_fk" FOREIGN KEY ("po_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quote_id_quotations_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_returns" ADD CONSTRAINT "vat_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "delivery_order_items_do_id_idx" ON "delivery_order_items" USING btree ("do_id");--> statement-breakpoint
CREATE INDEX "delivery_orders_status_customer_idx" ON "delivery_orders" USING btree ("status","customer_id");--> statement-breakpoint
CREATE INDEX "goods_receipt_items_receipt_id_idx" ON "goods_receipt_items" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "goods_receipts_po_id_idx" ON "goods_receipts" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_status_customer_idx" ON "invoices" USING btree ("status","customer_id");--> statement-breakpoint
CREATE INDEX "invoices_created_at_idx" ON "invoices" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoices_payment_status_idx" ON "invoices" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "products_sku_idx" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "products_is_active_idx" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "purchase_order_items_po_id_idx" ON "purchase_order_items" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_orders_order_date_idx" ON "purchase_orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_payment_status_idx" ON "purchase_orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "quotation_items_quote_id_idx" ON "quotation_items" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quotations_status_customer_idx" ON "quotations" USING btree ("status","customer_id");