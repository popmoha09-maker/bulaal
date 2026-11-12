/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'cashier' | 'inventory_manager' | 'admin';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  pinCode?: string;
  salesCount: number;
  voidedSales: number;
  avatar: string;
  jwtToken?: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  barcode: string;
  costPrice: number;
  retailPrice: number;
  category: string;
  minStockLevel: number;
  stockOutAlert?: number; // Stock Out Alert threshold
  description?: string;
  isEncrypted?: boolean;
  imageUrl?: string;
  color?: string;
  size?: string;
  qrCode?: string;
}

export interface InventoryItem {
  id: string;
  productId: string;
  quantityOnHand: number;
  warehouse: string;
  lastRestockedAt: string;
}

// Postpaid and Cash payments only (prepaid/wallet removed)
export type PaymentMethod = 'cash' | 'credit' | 'other';

export type ScannerMode = 'in' | 'out';

export interface InvoiceItem {
  productId: string;
  productName: string;
  category?: string;
  sku: string;
  quantity: number;
  soldPrice: number; // frozen at sale time
  costPrice: number; // saved for profit calculations
  color?: string;
  size?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  timestamp: string;
  userId: string;
  cashierName: string;
  items: InvoiceItem[];
  totalAmount: number;
  totalCost: number;
  paymentMethod: PaymentMethod;
  shiftId: string;
  status: 'synced' | 'pending_sync';
  isReconciled: boolean;
  customerId?: string;
  customerName?: string;
  isCreditSale?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  totalDebt: number;
  creditLimit?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DebtTransaction {
  id: string;
  customerId: string;
  customerName: string;
  type: 'debt_incurred' | 'payment_received';
  amount: number;
  balanceAfter: number;
  invoiceId?: string;
  invoiceNumber?: string;
  itemName?: string;
  itemCategory?: string;
  itemQuantity?: number;
  notes?: string;
  timestamp: string;
  recordedBy: string;
}

export interface Shift {
  id: string;
  openedAt: string;
  closedAt: string | null;
  openedBy: string;
  closedBy: string | null;
  initialCash: number;
  endingCash: number | null;
  actualCash: number | null;
  difference: number | null;
  status: 'open' | 'closed';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  action: string;
  details: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

export interface SyncQueueItem {
  id: string;
  actionType: 'create_invoice' | 'update_inventory' | 'void_invoice' | 'open_shift' | 'close_shift';
  payload: any;
  timestamp: string;
}

export interface CompanyConfig {
  companyName: string;
  businessType: string;
  currency: string;
  taxRate: number;
  country: string;
  defaultWarehouse: string;
  initialPettyCash: number;
  setupCompleted: boolean;
  setupDate?: string;
  tin: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location?: string;
}

