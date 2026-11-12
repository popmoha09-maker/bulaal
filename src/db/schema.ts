import { pgTable, text, timestamp, jsonb, numeric, integer, boolean } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passcode: text('passcode').notNull(),
  enterpriseName: text('enterprise_name').notNull(),
  enterpriseData: jsonb('enterprise_data').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  companyUsername: text('company_username').notNull(),
  sku: text('sku').notNull(),
  name: text('name').notNull(),
  barcode: text('barcode').default(''),
  costPrice: numeric('cost_price', { precision: 12, scale: 2 }).notNull().default('0'),
  retailPrice: numeric('retail_price', { precision: 12, scale: 2 }).notNull().default('0'),
  category: text('category').notNull().default('General'),
  minStockLevel: integer('min_stock_level').notNull().default(5),
  description: text('description').default(''),
  isEncrypted: boolean('is_encrypted').default(false),
  imageUrl: text('image_url').default(''),
  color: text('color').default(''),
  size: text('size').default(''),
  qrCode: text('qr_code').default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const inventory = pgTable('inventory', {
  id: text('id').primaryKey(),
  companyUsername: text('company_username').notNull(),
  productId: text('product_id').notNull(),
  quantityOnHand: integer('quantity_on_hand').notNull().default(0),
  warehouse: text('warehouse').notNull().default('w_1'),
  lastRestockedAt: timestamp('last_restocked_at', { withTimezone: true }).defaultNow(),
});

export const warehouses = pgTable('warehouses', {
  id: text('id').primaryKey(),
  companyUsername: text('company_username').notNull(),
  name: text('name').notNull(),
  location: text('location').default(''),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  companyUsername: text('company_username').notNull(),
  username: text('username').notNull(),
  role: text('role').notNull().default('cashier'),
  pinCode: text('pin_code').default('1234'),
  salesCount: integer('sales_count').default(0),
  voidedSales: integer('voided_sales').default(0),
  avatar: text('avatar').default('👤'),
  jwtToken: text('jwt_token').default(''),
});

export const shifts = pgTable('shifts', {
  id: text('id').primaryKey(),
  companyUsername: text('company_username').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  openedBy: text('opened_by').notNull(),
  closedBy: text('closed_by'),
  initialCash: numeric('initial_cash', { precision: 12, scale: 2 }).notNull().default('0'),
  endingCash: numeric('ending_cash', { precision: 12, scale: 2 }),
  actualCash: numeric('actual_cash', { precision: 12, scale: 2 }),
  difference: numeric('difference', { precision: 12, scale: 2 }),
  status: text('status').notNull().default('open'),
});

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  companyUsername: text('company_username').notNull(),
  invoiceNumber: text('invoice_number').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  userId: text('user_id').notNull(),
  cashierName: text('cashier_name').notNull(),
  items: jsonb('items').notNull().default([]),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  totalCost: numeric('total_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  paymentMethod: text('payment_method').notNull().default('cash'),
  shiftId: text('shift_id').notNull().default(''),
  status: text('status').notNull().default('synced'),
  isReconciled: boolean('is_reconciled').default(true),
  customerId: text('customer_id'),
  customerName: text('customer_name'),
  isCreditSale: boolean('is_credit_sale').default(false),
});

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  companyUsername: text('company_username').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  address: text('address'),
  totalDebt: numeric('total_debt', { precision: 12, scale: 2 }).notNull().default('0'),
  creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }).notNull().default('250'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const debtTransactions = pgTable('debt_transactions', {
  id: text('id').primaryKey(),
  companyUsername: text('company_username').notNull(),
  customerId: text('customer_id').notNull(),
  customerName: text('customer_name').notNull(),
  type: text('type').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
  balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).notNull().default('0'),
  invoiceId: text('invoice_id'),
  invoiceNumber: text('invoice_number'),
  notes: text('notes'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow(),
  recordedBy: text('recorded_by').default(''),
});

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  companyUsername: text('company_username').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  userId: text('user_id').notNull(),
  username: text('username').notNull(),
  action: text('action').notNull(),
  details: text('details').notNull(),
  type: text('type').notNull().default('info'),
});

export const storeSnapshots = pgTable('store_snapshots', {
  companyUsername: text('company_username').primaryKey(),
  state: jsonb('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
