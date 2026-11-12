/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product, InventoryItem, User, Shift, Invoice, AuditLog, Customer, DebtTransaction } from './types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod_timir_1',
    sku: 'TMR-1001',
    barcode: '6001234567806',
    qrCode: 'QR-TMR-1001',
    name: 'Timir (Dates) 1kg',
    category: 'Cunto (Food)',
    costPrice: 3.00,
    retailPrice: 4.50,
    minStockLevel: 10
  },
  {
    id: 'prod_timir_2',
    sku: 'TMR-1002',
    barcode: '6001234567899',
    qrCode: 'QR-TMR-1002',
    name: 'Timir Macaan 500g',
    category: 'Cunto (Food)',
    costPrice: 1.80,
    retailPrice: 2.75,
    minStockLevel: 10
  },
  {
    id: 'prod_bariis_1',
    sku: 'RCE-2001',
    barcode: '6001234567813',
    qrCode: 'QR-RCE-2001',
    name: 'Bariis Basmati 25kg',
    category: 'Cunto (Food)',
    costPrice: 20.00,
    retailPrice: 24.00,
    minStockLevel: 5
  },
  {
    id: 'prod_sonkor_1',
    sku: 'SGR-3001',
    barcode: '6001234567820',
    qrCode: 'QR-SGR-3001',
    name: 'Sonkor Macaan 50kg',
    category: 'Cunto (Food)',
    costPrice: 32.00,
    retailPrice: 38.00,
    minStockLevel: 5
  },
  {
    id: 'prod_saliid_1',
    sku: 'OIL-4001',
    barcode: '6001234567837',
    qrCode: 'QR-OIL-4001',
    name: 'Saliid Cunto 5L',
    category: 'Cunto (Food)',
    costPrice: 6.80,
    retailPrice: 8.50,
    minStockLevel: 10
  },
  {
    id: 'prod_caano_1',
    sku: 'MLK-5001',
    barcode: '6001234567844',
    qrCode: 'QR-MLK-5001',
    name: 'Caano Boorash Nido 2.5kg',
    category: 'Cunto (Food)',
    costPrice: 15.00,
    retailPrice: 18.00,
    minStockLevel: 8
  },
  {
    id: 'prod_shaah_1',
    sku: 'TEA-6001',
    barcode: '6001234567851',
    qrCode: 'QR-TEA-6001',
    name: 'Shaah Kayser 500g',
    category: 'Cabitaan (Drinks)',
    costPrice: 2.50,
    retailPrice: 3.50,
    minStockLevel: 15
  },
  {
    id: 'prod_baasto_1',
    sku: 'PST-7001',
    barcode: '6001234567868',
    qrCode: 'QR-PST-7001',
    name: 'Baasto Hawaash 10kg',
    category: 'Cunto (Food)',
    costPrice: 7.20,
    retailPrice: 9.00,
    minStockLevel: 10
  }
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  { id: 'inv_1', productId: 'prod_timir_1', warehouse: 'Central Warehouse', quantityOnHand: 60, lastRestockedAt: new Date().toISOString() },
  { id: 'inv_2', productId: 'prod_timir_2', warehouse: 'Central Warehouse', quantityOnHand: 80, lastRestockedAt: new Date().toISOString() },
  { id: 'inv_3', productId: 'prod_bariis_1', warehouse: 'Central Warehouse', quantityOnHand: 45, lastRestockedAt: new Date().toISOString() },
  { id: 'inv_4', productId: 'prod_sonkor_1', warehouse: 'Central Warehouse', quantityOnHand: 30, lastRestockedAt: new Date().toISOString() },
  { id: 'inv_5', productId: 'prod_saliid_1', warehouse: 'Central Warehouse', quantityOnHand: 55, lastRestockedAt: new Date().toISOString() },
  { id: 'inv_6', productId: 'prod_caano_1', warehouse: 'Central Warehouse', quantityOnHand: 40, lastRestockedAt: new Date().toISOString() },
  { id: 'inv_7', productId: 'prod_shaah_1', warehouse: 'Central Warehouse', quantityOnHand: 90, lastRestockedAt: new Date().toISOString() },
  { id: 'inv_8', productId: 'prod_baasto_1', warehouse: 'Central Warehouse', quantityOnHand: 50, lastRestockedAt: new Date().toISOString() }
];

export const INITIAL_USERS: User[] = [
  { 
    id: 'owner_1', 
    username: 'Mulkiilaha (Owner)', 
    role: 'admin', 
    pinCode: '1234',
    salesCount: 0, 
    voidedSales: 0, 
    avatar: '👑', 
    jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.owner-token' 
  }
];

export const INITIAL_SHIFTS: Shift[] = [];

export const INITIAL_INVOICES: Invoice[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];

export const SMART_BUNDLES: any[] = [];

export const INITIAL_CUSTOMERS: Customer[] = [];

export const INITIAL_DEBT_TRANSACTIONS: DebtTransaction[] = [];
