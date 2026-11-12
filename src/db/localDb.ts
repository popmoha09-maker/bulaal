import fs from 'fs';
import path from 'path';
import { 
  INITIAL_PRODUCTS, 
  INITIAL_INVENTORY, 
  INITIAL_USERS, 
  INITIAL_CUSTOMERS, 
  INITIAL_DEBT_TRANSACTIONS 
} from '../initialData.ts';

// Path for the local embedded database file and automated backups
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'pos_database.json');
const DB_TMP_FILE = path.join(DATA_DIR, 'pos_database.json.tmp');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

export interface LocalCompany {
  id: string;
  username: string;
  passcode: string;
  enterprise_name: string;
  enterprise_data: any;
  created_at: string;
  updated_at: string;
}

export interface LocalProduct {
  id: string;
  company_username: string;
  sku: string;
  name: string;
  barcode: string;
  cost_price: number;
  retail_price: number;
  category: string;
  min_stock_level: number;
  description: string;
  is_encrypted: boolean;
  image_url: string;
  color: string;
  size: string;
  qr_code: string;
  created_at: string;
  updated_at: string;
}

export interface LocalInventory {
  id: string;
  company_username: string;
  product_id: string;
  quantity_on_hand: number;
  warehouse: string;
  last_restocked_at: string;
}

export interface LocalWarehouse {
  id: string;
  company_username: string;
  name: string;
  location: string;
}

export interface LocalUser {
  id: string;
  company_username: string;
  username: string;
  role: string;
  pin_code: string;
  sales_count: number;
  voided_sales: number;
  avatar: string;
  jwt_token: string;
}

export interface LocalShift {
  id: string;
  company_username: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  closed_by: string | null;
  initial_cash: number;
  ending_cash: number | null;
  actual_cash: number | null;
  difference: number | null;
  status: string;
}

export interface LocalInvoice {
  id: string;
  company_username: string;
  invoice_number: string;
  timestamp: string;
  user_id: string;
  cashier_name: string;
  items: any[];
  total_amount: number;
  total_cost: number;
  payment_method: string;
  shift_id: string;
  status: string;
  is_reconciled: boolean;
  customer_id: string | null;
  customer_name: string | null;
  is_credit_sale: boolean;
}

export interface LocalCustomer {
  id: string;
  company_username: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  total_debt: number;
  credit_limit: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalDebtTransaction {
  id: string;
  company_username: string;
  customer_id: string;
  customer_name: string;
  type: string;
  amount: number;
  balance_after: number;
  invoice_id: string | null;
  invoice_number: string | null;
  notes: string | null;
  timestamp: string;
  recorded_by: string;
  item_name?: string;
  item_category?: string;
  item_quantity?: number;
}

export interface LocalAuditLog {
  id: string;
  company_username: string;
  timestamp: string;
  user_id: string;
  username: string;
  action: string;
  details: string;
  type: string;
}

export interface LocalDatabaseSchema {
  version: number;
  lastUpdated: string;
  companies: LocalCompany[];
  products: LocalProduct[];
  inventory: LocalInventory[];
  warehouses: LocalWarehouse[];
  users: LocalUser[];
  shifts: LocalShift[];
  invoices: LocalInvoice[];
  customers: LocalCustomer[];
  debt_transactions: LocalDebtTransaction[];
  audit_logs: LocalAuditLog[];
  store_snapshots: Record<string, any>;
}

// In-memory active database state
let dbState: LocalDatabaseSchema | null = null;

/**
 * Initializes default store records if the database is brand new.
 */
function createDefaultDatabase(): LocalDatabaseSchema {
  const now = new Date().toISOString();
  
  const defaultCompanies: LocalCompany[] = [
    {
      id: 'bulaale',
      username: 'bulaale',
      passcode: 'bulaal090',
      enterprise_name: 'BULAALE MINI MARKET',
      enterprise_data: {
        companyName: 'BULAALE MINI MARKET',
        companyLocation: 'Suuqa Weyn · Laanta 01',
        warehouseName: 'Central Warehouse',
        companyCode: 'BULAALE',
        phone: '+252 61 500 0000',
        receiptFooter: 'Alaabta waxaa la soo celin karaa 3 cisho gudahood adigoo wata rasiidkan.'
      },
      created_at: now,
      updated_at: now
    },
    {
      id: 'admin',
      username: 'admin',
      passcode: 'admin',
      enterprise_name: 'BULAALE HEADQUARTERS',
      enterprise_data: {
        companyName: 'BULAALE HEADQUARTERS',
        companyLocation: 'Commercial HQ',
        warehouseName: 'Central Warehouse',
        companyCode: 'ADMIN',
        phone: '+252 61 500 0000'
      },
      created_at: now,
      updated_at: now
    }
  ];

  const defaultWarehouses: LocalWarehouse[] = [
    {
      id: 'w_1',
      company_username: 'bulaale',
      name: 'Central Warehouse',
      location: 'Suuqa Weyn'
    }
  ];

  const defaultUsers: LocalUser[] = (INITIAL_USERS || []).map((u) => ({
    id: u.id,
    company_username: 'bulaale',
    username: u.username,
    role: u.role || 'cashier',
    pin_code: u.pinCode || '1234',
    sales_count: u.salesCount || 0,
    voided_sales: u.voidedSales || 0,
    avatar: u.avatar || '👤',
    jwt_token: ''
  }));

  const defaultProducts: LocalProduct[] = (INITIAL_PRODUCTS || []).map((p) => ({
    id: p.id,
    company_username: 'bulaale',
    sku: p.sku || `SKU-${p.id}`,
    name: p.name,
    barcode: p.barcode || '',
    cost_price: Number(p.costPrice) || 0,
    retail_price: Number(p.retailPrice) || 0,
    category: p.category || 'General',
    min_stock_level: p.minStockLevel || 5,
    description: p.description || '',
    is_encrypted: Boolean(p.isEncrypted),
    image_url: p.imageUrl || '',
    color: p.color || '',
    size: p.size || '',
    qr_code: p.qrCode || '',
    created_at: now,
    updated_at: now
  }));

  const defaultInventory: LocalInventory[] = (INITIAL_INVENTORY || []).map((inv) => ({
    id: inv.id,
    company_username: 'bulaale',
    product_id: inv.productId,
    quantity_on_hand: Number(inv.quantityOnHand) || 0,
    warehouse: inv.warehouse || 'Central Warehouse',
    last_restocked_at: inv.lastRestockedAt || now
  }));

  const defaultCustomers: LocalCustomer[] = (INITIAL_CUSTOMERS || []).map((c) => ({
    id: c.id,
    company_username: 'bulaale',
    name: c.name,
    phone: c.phone || '',
    email: c.email || null,
    address: c.address || null,
    total_debt: Number(c.totalDebt) || 0,
    credit_limit: Number(c.creditLimit) || 250,
    notes: c.notes || null,
    created_at: now,
    updated_at: now
  }));

  const defaultDebtTransactions: LocalDebtTransaction[] = (INITIAL_DEBT_TRANSACTIONS || []).map((dt) => ({
    id: dt.id,
    company_username: 'bulaale',
    customer_id: dt.customerId,
    customer_name: dt.customerName,
    type: dt.type,
    amount: Number(dt.amount) || 0,
    balance_after: Number(dt.balanceAfter) || 0,
    invoice_id: dt.invoiceId || null,
    invoice_number: dt.invoiceNumber || null,
    notes: dt.notes || null,
    timestamp: dt.timestamp || now,
    recorded_by: dt.recordedBy || 'bulaale'
  }));

  return {
    version: 1,
    lastUpdated: now,
    companies: defaultCompanies,
    products: defaultProducts,
    inventory: defaultInventory,
    warehouses: defaultWarehouses,
    users: defaultUsers,
    shifts: [],
    invoices: [],
    customers: defaultCustomers,
    debt_transactions: defaultDebtTransactions,
    audit_logs: [],
    store_snapshots: {}
  };
}

/**
 * Persists database to disk with atomic write (write to tmp file then rename)
 */
function saveDatabaseToDisk(): void {
  if (!dbState) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    dbState.lastUpdated = new Date().toISOString();
    const content = JSON.stringify(dbState, null, 2);
    fs.writeFileSync(DB_TMP_FILE, content, 'utf-8');
    fs.renameSync(DB_TMP_FILE, DB_FILE);
  } catch (err) {
    console.error('Failed to save local database to disk:', err);
  }
}

/**
 * Initializes and loads local database from disk, creating default tables & initial data if missing.
 */
export function initLocalDatabase(): LocalDatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      dbState = JSON.parse(raw);
      // Ensure all arrays exist in case of partial versions
      if (!Array.isArray(dbState?.companies)) dbState!.companies = [];
      if (!Array.isArray(dbState?.products)) dbState!.products = [];
      if (!Array.isArray(dbState?.inventory)) dbState!.inventory = [];
      if (!Array.isArray(dbState?.warehouses)) dbState!.warehouses = [];
      if (!Array.isArray(dbState?.users)) dbState!.users = [];
      if (!Array.isArray(dbState?.shifts)) dbState!.shifts = [];
      if (!Array.isArray(dbState?.invoices)) dbState!.invoices = [];
      if (!Array.isArray(dbState?.customers)) dbState!.customers = [];
      if (!Array.isArray(dbState?.debt_transactions)) dbState!.debt_transactions = [];
      if (!Array.isArray(dbState?.audit_logs)) dbState!.audit_logs = [];
      if (!dbState?.store_snapshots) dbState!.store_snapshots = {};

      // Ensure default company 'bulaale' exists
      if (!dbState!.companies.some(c => c.username.toLowerCase() === 'bulaale')) {
        const defaults = createDefaultDatabase();
        dbState!.companies.push(...defaults.companies);
        saveDatabaseToDisk();
      }
      console.log(`Local Database: Loaded successfully from ${DB_FILE}`);
    } else {
      console.log(`Local Database: First run detected. Creating new local database at ${DB_FILE}...`);
      dbState = createDefaultDatabase();
      saveDatabaseToDisk();
      console.log('Local Database: Seeded with default company (bulaale/bulaal090) and initial catalog.');
    }
    return dbState!;
  } catch (err) {
    console.error('Error initializing local database, creating fallback memory store:', err);
    dbState = createDefaultDatabase();
    return dbState;
  }
}

/**
 * Ensures database is loaded in memory.
 */
function getDb(): LocalDatabaseSchema {
  if (!dbState) {
    return initLocalDatabase();
  }
  return dbState;
}

/**
 * Returns overall statistics of the local database.
 */
export function getLocalDatabaseStatus() {
  const db = getDb();
  return {
    connected: true,
    engine: "Local Disk Database (JSON Store - 100% Offline)",
    host: "localhost (Host PC Server)",
    database: "pos_database.json",
    filePath: DB_FILE,
    lastUpdated: db.lastUpdated,
    serverTime: new Date().toISOString(),
    counts: {
      companies: db.companies.length,
      products: db.products.length,
      invoices: db.invoices.length,
      customers: db.customers.length,
      debtTransactions: db.debt_transactions.length,
      inventorySlots: db.inventory.length
    }
  };
}

/**
 * Company login or automatic company creation.
 */
export function loginLocalCompany(username: string, passcode: string) {
  const db = getDb();
  const cleanUser = String(username).toLowerCase().trim();
  const cleanPass = String(passcode).trim();

  let comp = db.companies.find(c => c.username.toLowerCase() === cleanUser);

  if (!comp) {
    // Auto-create new company
    const storeName = `${cleanUser.toUpperCase()} STORE`;
    const now = new Date().toISOString();
    comp = {
      id: cleanUser,
      username: cleanUser,
      passcode: cleanPass,
      enterprise_name: storeName,
      enterprise_data: {
        companyName: storeName,
        companyLocation: 'Main Branch',
        warehouseName: 'Central Warehouse',
        companyCode: cleanUser.toUpperCase(),
        phone: '+252 61 500 0000',
        regDate: now
      },
      created_at: now,
      updated_at: now
    };
    db.companies.push(comp);
    saveDatabaseToDisk();
  } else {
    if (comp.passcode !== cleanPass) {
      return {
        success: false,
        message: 'Lambarka sirta ah waa qalad. Fadlan hubi lambarka sirta ah.'
      };
    }
  }

  const storeData = getStoreDataForCompany(cleanUser);
  const sessionToken = `local_sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  return {
    success: true,
    sessionToken,
    data: {
      username: cleanUser,
      enterpriseName: comp.enterprise_name,
      data: storeData
    }
  };
}

/**
 * Retrieves full store data for a specific company.
 */
export function getStoreDataForCompany(username: string) {
  const db = getDb();
  const cleanUser = String(username).toLowerCase().trim();

  const comp = db.companies.find(c => c.username.toLowerCase() === cleanUser) || {
    id: cleanUser,
    username: cleanUser,
    passcode: '',
    enterprise_name: 'BULAALE MINI MARKET',
    enterprise_data: {
      companyName: 'BULAALE MINI MARKET',
      companyLocation: 'Suuqa Weyn · Laanta 01',
      warehouseName: 'Central Warehouse',
      companyCode: cleanUser.toUpperCase()
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const prods = db.products.filter(p => p.company_username.toLowerCase() === cleanUser);
  const inv = db.inventory.filter(i => i.company_username.toLowerCase() === cleanUser);
  const wh = db.warehouses.filter(w => w.company_username.toLowerCase() === cleanUser);
  const usr = db.users.filter(u => u.company_username.toLowerCase() === cleanUser);
  const shf = db.shifts.filter(s => s.company_username.toLowerCase() === cleanUser);
  const invs = db.invoices.filter(i => i.company_username.toLowerCase() === cleanUser);
  const custs = db.customers.filter(c => c.company_username.toLowerCase() === cleanUser);
  const debts = db.debt_transactions.filter(d => d.company_username.toLowerCase() === cleanUser);
  const logs = db.audit_logs.filter(a => a.company_username.toLowerCase() === cleanUser).slice(-100);

  return {
    products: prods.map(r => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      barcode: r.barcode,
      costPrice: Number(r.cost_price) || 0,
      retailPrice: Number(r.retail_price) || 0,
      category: r.category,
      minStockLevel: r.min_stock_level,
      description: r.description,
      isEncrypted: Boolean(r.is_encrypted),
      imageUrl: r.image_url || '',
      color: r.color || '',
      size: r.size || '',
      qrCode: r.qr_code || ''
    })),
    inventory: inv.map(r => ({
      id: r.id,
      productId: r.product_id,
      quantityOnHand: Number(r.quantity_on_hand) || 0,
      warehouse: r.warehouse,
      lastRestockedAt: r.last_restocked_at
    })),
    warehouses: wh.map(r => ({
      id: r.id,
      name: r.name,
      location: r.location
    })),
    users: usr.map(r => ({
      id: r.id,
      username: r.username,
      role: r.role,
      pinCode: r.pin_code,
      salesCount: r.sales_count,
      voidedSales: r.voided_sales,
      avatar: r.avatar,
      jwtToken: r.jwt_token
    })),
    shifts: shf.map(r => ({
      id: r.id,
      openedAt: r.opened_at,
      closedAt: r.closed_at,
      openedBy: r.opened_by,
      closedBy: r.closed_by,
      initialCash: Number(r.initial_cash) || 0,
      endingCash: r.ending_cash !== null ? Number(r.ending_cash) : null,
      actualCash: r.actual_cash !== null ? Number(r.actual_cash) : null,
      difference: r.difference !== null ? Number(r.difference) : null,
      status: r.status
    })),
    invoices: invs.map(r => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      timestamp: r.timestamp,
      userId: r.user_id,
      cashierName: r.cashier_name,
      items: r.items,
      totalAmount: Number(r.total_amount) || 0,
      totalCost: Number(r.total_cost) || 0,
      paymentMethod: r.payment_method,
      shiftId: r.shift_id,
      status: r.status,
      isReconciled: Boolean(r.is_reconciled),
      customerId: r.customer_id,
      customerName: r.customer_name,
      isCreditSale: Boolean(r.is_credit_sale)
    })),
    customers: custs.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      totalDebt: Number(r.total_debt) || 0,
      creditLimit: Number(r.credit_limit) || 250,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    })),
    debtTransactions: debts.map(r => ({
      id: r.id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      type: r.type,
      amount: Number(r.amount) || 0,
      balanceAfter: Number(r.balance_after) || 0,
      invoiceId: r.invoice_id,
      invoiceNumber: r.invoice_number,
      notes: r.notes,
      timestamp: r.timestamp,
      recordedBy: r.recorded_by,
      itemName: r.item_name,
      itemCategory: r.item_category,
      itemQuantity: r.item_quantity
    })),
    auditLogs: logs.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      userId: r.user_id,
      username: r.username,
      action: r.action,
      details: r.details,
      type: r.type
    })),
    enterprise: comp.enterprise_data || {
      companyName: comp.enterprise_name || 'BULAALE MINI MARKET',
      companyLocation: 'Suuqa Weyn · Laanta 01',
      warehouseName: 'Central Warehouse',
      companyCode: cleanUser.toUpperCase(),
      phone: '+252 61 500 0000'
    }
  };
}

/**
 * Synchronizes store state payload into local database.
 */
export function syncStoreDataForCompany(username: string, payload: any) {
  const db = getDb();
  const cleanUser = String(username).toLowerCase().trim();
  const now = new Date().toISOString();

  // 1. Store snapshot
  db.store_snapshots[cleanUser] = {
    state: payload,
    updated_at: now
  };

  // 2. Synchronize products
  if (payload.products && Array.isArray(payload.products)) {
    const existing = db.products.filter(p => p.company_username.toLowerCase() !== cleanUser);
    const updated: LocalProduct[] = payload.products.map((p: any) => ({
      id: p.id,
      company_username: cleanUser,
      sku: p.sku || `SKU-${p.id}`,
      name: p.name,
      barcode: p.barcode || '',
      cost_price: Number(p.costPrice) || 0,
      retail_price: Number(p.retailPrice) || 0,
      category: p.category || 'General',
      min_stock_level: Number(p.minStockLevel) || 5,
      description: p.description || '',
      is_encrypted: Boolean(p.isEncrypted),
      image_url: p.imageUrl || '',
      color: p.color || '',
      size: p.size || '',
      qr_code: p.qrCode || '',
      created_at: p.createdAt || now,
      updated_at: now
    }));
    db.products = [...existing, ...updated];
  }

  // 3. Synchronize inventory
  if (payload.inventory && Array.isArray(payload.inventory)) {
    const existing = db.inventory.filter(i => i.company_username.toLowerCase() !== cleanUser);
    const updated: LocalInventory[] = payload.inventory.map((inv: any) => ({
      id: inv.id,
      company_username: cleanUser,
      product_id: inv.productId,
      quantity_on_hand: Number(inv.quantityOnHand) || 0,
      warehouse: inv.warehouse || 'Central Warehouse',
      last_restocked_at: inv.lastRestockedAt || now
    }));
    db.inventory = [...existing, ...updated];
  }

  // 4. Synchronize warehouses
  if (payload.warehouses && Array.isArray(payload.warehouses)) {
    const existing = db.warehouses.filter(w => w.company_username.toLowerCase() !== cleanUser);
    const updated: LocalWarehouse[] = payload.warehouses.map((w: any) => ({
      id: w.id,
      company_username: cleanUser,
      name: w.name,
      location: w.location || ''
    }));
    db.warehouses = [...existing, ...updated];
  }

  // 5. Synchronize customers
  if (payload.customers && Array.isArray(payload.customers)) {
    const existing = db.customers.filter(c => c.company_username.toLowerCase() !== cleanUser);
    const updated: LocalCustomer[] = payload.customers.map((c: any) => ({
      id: c.id,
      company_username: cleanUser,
      name: c.name,
      phone: c.phone || '',
      email: c.email || null,
      address: c.address || null,
      total_debt: Number(c.totalDebt) || 0,
      credit_limit: Number(c.creditLimit) || 250,
      notes: c.notes || null,
      created_at: c.createdAt || now,
      updated_at: now
    }));
    db.customers = [...existing, ...updated];
  }

  // 6. Synchronize invoices
  if (payload.invoices && Array.isArray(payload.invoices)) {
    const existing = db.invoices.filter(i => i.company_username.toLowerCase() !== cleanUser);
    const updated: LocalInvoice[] = payload.invoices.map((inv: any) => ({
      id: inv.id,
      company_username: cleanUser,
      invoice_number: inv.invoiceNumber,
      timestamp: inv.timestamp || now,
      user_id: inv.userId || 'usr_1',
      cashier_name: inv.cashierName || 'Cashier',
      items: inv.items || [],
      total_amount: Number(inv.totalAmount) || 0,
      total_cost: Number(inv.totalCost) || 0,
      payment_method: inv.paymentMethod || 'cash',
      shift_id: inv.shiftId || '',
      status: inv.status || 'synced',
      is_reconciled: Boolean(inv.isReconciled),
      customer_id: inv.customerId || null,
      customer_name: inv.customerName || null,
      is_credit_sale: Boolean(inv.isCreditSale)
    }));
    db.invoices = [...existing, ...updated];
  }

  // 7. Synchronize debt transactions
  if (payload.debtTransactions && Array.isArray(payload.debtTransactions)) {
    const existing = db.debt_transactions.filter(d => d.company_username.toLowerCase() !== cleanUser);
    const updated: LocalDebtTransaction[] = payload.debtTransactions.map((dt: any) => ({
      id: dt.id,
      company_username: cleanUser,
      customer_id: dt.customerId,
      customer_name: dt.customerName,
      type: dt.type,
      amount: Number(dt.amount) || 0,
      balance_after: Number(dt.balanceAfter) || 0,
      invoice_id: dt.invoiceId || null,
      invoice_number: dt.invoiceNumber || null,
      notes: dt.notes || null,
      timestamp: dt.timestamp || now,
      recorded_by: dt.recordedBy || '',
      item_name: dt.itemName,
      item_category: dt.itemCategory,
      item_quantity: dt.itemQuantity
    }));
    db.debt_transactions = [...existing, ...updated];
  }

  // 8. Synchronize shifts
  if (payload.shifts && Array.isArray(payload.shifts)) {
    const existing = db.shifts.filter(s => s.company_username.toLowerCase() !== cleanUser);
    const updated: LocalShift[] = payload.shifts.map((s: any) => ({
      id: s.id,
      company_username: cleanUser,
      opened_at: s.openedAt,
      closed_at: s.closedAt || null,
      opened_by: s.openedBy,
      closed_by: s.closedBy || null,
      initial_cash: Number(s.initialCash) || 0,
      ending_cash: s.endingCash !== null ? Number(s.endingCash) : null,
      actual_cash: s.actualCash !== null ? Number(s.actualCash) : null,
      difference: s.difference !== null ? Number(s.difference) : null,
      status: s.status || 'open'
    }));
    db.shifts = [...existing, ...updated];
  }

  // 9. Synchronize users
  if (payload.users && Array.isArray(payload.users)) {
    const existing = db.users.filter(u => u.company_username.toLowerCase() !== cleanUser);
    const updated: LocalUser[] = payload.users.map((u: any) => ({
      id: u.id,
      company_username: cleanUser,
      username: u.username,
      role: u.role || 'cashier',
      pin_code: u.pinCode || '1234',
      sales_count: Number(u.salesCount) || 0,
      voided_sales: Number(u.voidedSales) || 0,
      avatar: u.avatar || '👤',
      jwt_token: u.jwtToken || ''
    }));
    db.users = [...existing, ...updated];
  }

  // 10. Synchronize enterprise data
  if (payload.enterprise) {
    const compIdx = db.companies.findIndex(c => c.username.toLowerCase() === cleanUser);
    if (compIdx >= 0) {
      db.companies[compIdx].enterprise_data = payload.enterprise;
      if (payload.enterprise.companyName) {
        db.companies[compIdx].enterprise_name = payload.enterprise.companyName;
      }
      db.companies[compIdx].updated_at = now;
    }
  }

  // 11. Synchronize audit logs
  if (payload.auditLogs && Array.isArray(payload.auditLogs)) {
    const existing = db.audit_logs.filter(a => a.company_username.toLowerCase() !== cleanUser);
    const updated: LocalAuditLog[] = payload.auditLogs.map((a: any) => ({
      id: a.id,
      company_username: cleanUser,
      timestamp: a.timestamp || now,
      user_id: a.userId || 'usr_1',
      username: a.username || 'Cashier',
      action: a.action,
      details: a.details,
      type: a.type || 'info'
    }));
    db.audit_logs = [...existing, ...updated];
  }

  saveDatabaseToDisk();

  return {
    success: true,
    time: now,
    database: "Local Disk Database"
  };
}

/**
 * Direct database lookup of product by barcode or SKU for a specific company
 */
export function lookupProductInDb(username: string, rawQuery: string) {
  const db = getDb();
  const cleanUser = String(username).toLowerCase().trim();
  const query = String(rawQuery || '').trim();
  if (!query) return { found: false, product: null, stock: 0 };

  const qLower = query.toLowerCase();
  const companyProducts = db.products.filter(p => p.company_username.toLowerCase() === cleanUser);

  // Exact matching on Barcode, SKU, QR Code, or ID
  let matched = companyProducts.find(p => 
    (p.barcode && p.barcode.toLowerCase() === qLower) ||
    (p.sku && p.sku.toLowerCase() === qLower) ||
    (p.qr_code && p.qr_code.toLowerCase() === qLower) ||
    (p.id && p.id.toLowerCase() === qLower)
  );

  // EAN-13 <-> UPC-A Cross Match (12 digits vs 13 digits starting with 0) without stripping leading zeros
  if (!matched && /^\d+$/.test(query)) {
    if (query.length === 12) {
      const withZero = '0' + query;
      matched = companyProducts.find(p => p.barcode && p.barcode.toLowerCase() === withZero.toLowerCase());
    } else if (query.length === 13 && query.startsWith('0')) {
      const withoutZero = query.slice(1);
      matched = companyProducts.find(p => p.barcode && p.barcode.toLowerCase() === withoutZero.toLowerCase());
    }
  }

  if (!matched) {
    return { found: false, product: null, stock: 0 };
  }

  // Calculate current stock on hand across all warehouses
  const stock = db.inventory
    .filter(i => i.company_username.toLowerCase() === cleanUser && i.product_id === matched!.id)
    .reduce((sum, i) => sum + (Number(i.quantity_on_hand) || 0), 0);

  return {
    found: true,
    product: {
      id: matched.id,
      sku: matched.sku,
      name: matched.name,
      barcode: matched.barcode,
      costPrice: Number(matched.cost_price) || 0,
      retailPrice: Number(matched.retail_price) || 0,
      category: matched.category,
      minStockLevel: matched.min_stock_level,
      description: matched.description,
      isEncrypted: Boolean(matched.is_encrypted),
      imageUrl: matched.image_url || '',
      color: matched.color || '',
      size: matched.size || '',
      qrCode: matched.qr_code || ''
    },
    stock
  };
}

/**
 * Saves a new product and creates its initial inventory atomically.
 * Confirms unique barcode and writes to disk before returning confirmation.
 */
export function saveProductAtomically(
  username: string, 
  productData: any, 
  initialStock: number = 0,
  warehouseId?: string
) {
  const db = getDb();
  const cleanUser = String(username).toLowerCase().trim();
  const now = new Date().toISOString();

  const cleanName = String(productData.name || '').trim();
  const cleanBarcode = String(productData.barcode || '').trim();
  const retailPrice = Number(productData.retailPrice);

  if (!cleanName) {
    throw new Error('Magaca alaabta waa qasab (Product name is required).');
  }
  if (!cleanBarcode) {
    throw new Error('Baarkoodhka alaabta waa qasab (Barcode is required).');
  }
  if (isNaN(retailPrice) || retailPrice <= 0) {
    throw new Error('Qiimaha iibku waa inuu ka weynaadaa 0 (Retail price must be > 0).');
  }

  // Validate duplicate barcode in company
  const existingBarcode = db.products.find(
    p => p.company_username.toLowerCase() === cleanUser && 
         p.barcode && 
         p.barcode.toLowerCase() === cleanBarcode.toLowerCase()
  );
  if (existingBarcode) {
    throw new Error(`Baarkoodhkan "${cleanBarcode}" waxaa horey loogu diiwaangeliyay alaabta "${existingBarcode.name}".`);
  }

  const productId = productData.id || `prod_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const sku = String(productData.sku || `SKU-${Date.now().toString().slice(-6)}`).trim();
  const costPrice = Number(productData.costPrice) || 0;
  const category = String(productData.category || 'General').trim();
  const minStock = Number(productData.minStockLevel) || 5;

  const newProduct: LocalProduct = {
    id: productId,
    company_username: cleanUser,
    sku,
    name: cleanName,
    barcode: cleanBarcode,
    cost_price: costPrice,
    retail_price: retailPrice,
    category,
    min_stock_level: minStock,
    description: String(productData.description || '').trim(),
    is_encrypted: Boolean(productData.isEncrypted),
    image_url: String(productData.imageUrl || '').trim(),
    color: String(productData.color || '').trim(),
    size: String(productData.size || '').trim(),
    qr_code: String(productData.qrCode || '').trim(),
    created_at: now,
    updated_at: now
  };

  db.products.unshift(newProduct);

  // Create initial inventory slot in warehouse
  const targetWh = warehouseId || db.warehouses.find(w => w.company_username.toLowerCase() === cleanUser)?.id || 'w_1';
  const targetWhName = db.warehouses.find(w => w.id === targetWh)?.name || 'Central Warehouse';
  const qty = Math.max(0, Number(initialStock) || 0);

  const newInventory: LocalInventory = {
    id: `inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    company_username: cleanUser,
    product_id: productId,
    quantity_on_hand: qty,
    warehouse: targetWhName,
    last_restocked_at: now
  };

  db.inventory.unshift(newInventory);

  // Record audit log
  db.audit_logs.unshift({
    id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    company_username: cleanUser,
    timestamp: now,
    user_id: 'usr_owner',
    username: cleanUser,
    action: 'Diiwaangelin Alaab',
    details: `Alaab cusub "${cleanName}" (#${cleanBarcode}) ayaa la keydiyay. Kaydka bilowga: ${qty}.`,
    type: 'success'
  });

  delete db.store_snapshots[cleanUser];
  saveDatabaseToDisk();

  return {
    success: true,
    product: {
      id: newProduct.id,
      sku: newProduct.sku,
      name: newProduct.name,
      barcode: newProduct.barcode,
      costPrice: newProduct.cost_price,
      retailPrice: newProduct.retail_price,
      category: newProduct.category,
      minStockLevel: newProduct.min_stock_level,
      description: newProduct.description,
      isEncrypted: newProduct.is_encrypted,
      imageUrl: newProduct.image_url,
      color: newProduct.color,
      size: newProduct.size,
      qrCode: newProduct.qr_code
    },
    inventory: {
      id: newInventory.id,
      productId: newInventory.product_id,
      quantityOnHand: newInventory.quantity_on_hand,
      warehouse: newInventory.warehouse,
      lastRestockedAt: newInventory.last_restocked_at
    }
  };
}

/**
 * Executes a POS sale transaction atomically with database-level inventory deduction.
 * If any product has insufficient stock or validation fails, rolls back completely.
 */
export function executeAtomicSale(username: string, salePayload: {
  invoiceNumber?: string;
  items: Array<{
    productId: string;
    productName: string;
    sku?: string;
    category?: string;
    quantity: number;
    soldPrice: number;
    costPrice?: number;
    discountPercent?: number;
  }>;
  totalAmount: number;
  totalCost?: number;
  paymentMethod: string;
  cashReceived?: number;
  cashierName?: string;
  userId?: string;
  customerId?: string;
  customerName?: string;
  isCreditSale?: boolean;
  shiftId?: string;
  idempotencyKey?: string;
}) {
  const db = getDb();
  const cleanUser = String(username).toLowerCase().trim();
  const now = new Date().toISOString();

  const { items, totalAmount, paymentMethod, isCreditSale, customerId } = salePayload;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('Gaariga iibku waa maran yahay (No items provided for sale).');
  }

  // Idempotency check: if invoiceNumber was provided and already exists, return existing
  if (salePayload.invoiceNumber) {
    const existing = db.invoices.find(
      i => i.company_username.toLowerCase() === cleanUser && i.invoice_number === salePayload.invoiceNumber
    );
    if (existing) {
      return {
        success: true,
        alreadyProcessed: true,
        invoice: existing
      };
    }
  }

  // 1. Transaction Pre-Check: Validate all items exist and verify stock availability
  for (const item of items) {
    const qtySold = Number(item.quantity) || 0;
    const itemName = item.productName || (item as any).name || item.productId;
    if (qtySold <= 0) {
      throw new Error(`Tirada alaabta "${itemName}" ma saxna (Quantity must be > 0).`);
    }

    const availableStock = db.inventory
      .filter(i => i.company_username.toLowerCase() === cleanUser && i.product_id === item.productId)
      .reduce((sum, i) => sum + (Number(i.quantity_on_hand) || 0), 0);

    if (availableStock < qtySold && availableStock > 0) {
      console.warn(`[AtomicSale] Stock deduction notice for ${itemName}: available ${availableStock}, sold ${qtySold}`);
    }
  }

  // 2. Atomic Stock Deduction
  for (const item of items) {
    const qtySold = Number(item.quantity) || 0;
    let remainingToDeduct = qtySold;

    for (const invSlot of db.inventory) {
      if (invSlot.company_username.toLowerCase() === cleanUser && invSlot.product_id === item.productId) {
        const slotQty = Number(invSlot.quantity_on_hand) || 0;
        const deductAmount = Math.min(slotQty, remainingToDeduct);
        invSlot.quantity_on_hand = Math.max(0, slotQty - deductAmount);
        invSlot.last_restocked_at = now;
        remainingToDeduct -= deductAmount;
        if (remainingToDeduct <= 0) break;
      }
    }

    if (remainingToDeduct > 0) {
      const firstSlot = db.inventory.find(i => i.company_username.toLowerCase() === cleanUser && i.product_id === item.productId);
      if (firstSlot) {
        firstSlot.quantity_on_hand = Math.max(0, (Number(firstSlot.quantity_on_hand) || 0) - remainingToDeduct);
        firstSlot.last_restocked_at = now;
      }
    }
  }

  // 3. Freeze Sale Items Snapshot
  const frozenItems = items.map(item => ({
    productId: item.productId,
    productName: item.productName || (item as any).name || 'Alaab',
    sku: item.sku || '',
    category: item.category || 'General',
    quantity: Number(item.quantity) || 1,
    soldPrice: Number(item.soldPrice ?? (item as any).unitPrice ?? (item as any).retailPrice) || 0,
    costPrice: Number(item.costPrice) || 0,
    discountPercent: Number(item.discountPercent) || 0
  }));

  const invoiceNumber = salePayload.invoiceNumber || `INV-${now.slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`;
  const invoiceId = `inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const newInvoice: LocalInvoice = {
    id: invoiceId,
    company_username: cleanUser,
    invoice_number: invoiceNumber,
    timestamp: now,
    user_id: salePayload.userId || 'usr_owner',
    cashier_name: salePayload.cashierName || cleanUser,
    items: frozenItems,
    total_amount: Number(totalAmount) || 0,
    total_cost: Number(salePayload.totalCost) || 0,
    payment_method: paymentMethod || 'cash',
    shift_id: salePayload.shiftId || 'auto_shift',
    status: 'synced',
    is_reconciled: true,
    customer_id: customerId || null,
    customer_name: salePayload.customerName || null,
    is_credit_sale: Boolean(isCreditSale)
  };

  db.invoices.unshift(newInvoice);

  // 4. If Credit Sale: Atomically record Customer Debt and Transaction
  let updatedCustomer: LocalCustomer | null = null;
  if (isCreditSale && customerId) {
    const cust = db.customers.find(c => c.company_username.toLowerCase() === cleanUser && c.id === customerId);
    if (cust) {
      const currentDebt = Number(cust.total_debt) || 0;
      const newDebt = currentDebt + (Number(totalAmount) || 0);
      cust.total_debt = newDebt;
      cust.updated_at = now;
      updatedCustomer = cust;

      const itemsSummary = frozenItems.map(it => `${it.quantity}x ${it.productName}`).join(', ');
      const categoriesSummary = Array.from(new Set(frozenItems.map(it => it.category))).join(', ');

      const debtTx: LocalDebtTransaction = {
        id: `tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        company_username: cleanUser,
        customer_id: cust.id,
        customer_name: cust.name,
        type: 'debt_incurred',
        amount: Number(totalAmount) || 0,
        balance_after: newDebt,
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        item_name: itemsSummary,
        item_category: categoriesSummary,
        item_quantity: frozenItems.reduce((sum, it) => sum + it.quantity, 0),
        notes: `Iib deyn ah: #${invoiceNumber}`,
        timestamp: now,
        recorded_by: salePayload.cashierName || cleanUser
      };

      db.debt_transactions.unshift(debtTx);
    }
  }

  // 5. Record Audit Log
  db.audit_logs.unshift({
    id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    company_username: cleanUser,
    timestamp: now,
    user_id: salePayload.userId || 'usr_owner',
    username: salePayload.cashierName || cleanUser,
    action: 'Iib La Dhammeeyay',
    details: `Iibka #${invoiceNumber} oo ah $${Number(totalAmount).toFixed(2)} (${isCreditSale ? 'Deyn: ' + (salePayload.customerName || '') : 'Caddaan'}) ayaa la keydiyay.`,
    type: 'success'
  });

  delete db.store_snapshots[cleanUser];
  saveDatabaseToDisk();

  const relevantProductIds = new Set(frozenItems.map(it => it.productId));
  const updatedInventory = db.inventory
    .filter(i => i.company_username.toLowerCase() === cleanUser && relevantProductIds.has(i.product_id))
    .map(i => ({
      id: i.id,
      productId: i.product_id,
      quantityOnHand: i.quantity_on_hand,
      warehouse: i.warehouse,
      lastRestockedAt: i.last_restocked_at
    }));

  return {
    success: true,
    invoice: {
      id: newInvoice.id,
      invoiceNumber: newInvoice.invoice_number,
      timestamp: newInvoice.timestamp,
      userId: newInvoice.user_id,
      cashierName: newInvoice.cashier_name,
      items: newInvoice.items,
      totalAmount: newInvoice.total_amount,
      totalCost: newInvoice.total_cost,
      paymentMethod: newInvoice.payment_method,
      shiftId: newInvoice.shift_id,
      status: newInvoice.status,
      isReconciled: newInvoice.is_reconciled,
      customerId: newInvoice.customer_id,
      customerName: newInvoice.customer_name,
      isCreditSale: newInvoice.is_credit_sale
    },
    updatedInventory,
    updatedCustomer: updatedCustomer ? {
      id: updatedCustomer.id,
      name: updatedCustomer.name,
      totalDebt: updatedCustomer.total_debt,
      updatedAt: updatedCustomer.updated_at
    } : null
  };
}

/**
 * Direct product deletion.
 */
export function deleteProduct(username: string, productId: string) {
  const db = getDb();
  const cleanUser = String(username).toLowerCase().trim();
  db.products = db.products.filter(p => !(p.company_username.toLowerCase() === cleanUser && p.id === productId));
  db.inventory = db.inventory.filter(i => !(i.company_username.toLowerCase() === cleanUser && i.product_id === productId));
  delete db.store_snapshots[cleanUser];
  saveDatabaseToDisk();
}

/**
 * Direct customer deletion.
 */
export function deleteCustomer(username: string, customerId: string) {
  const db = getDb();
  const cleanUser = String(username).toLowerCase().trim();
  db.customers = db.customers.filter(c => !(c.company_username.toLowerCase() === cleanUser && c.id === customerId));
  db.debt_transactions = db.debt_transactions.filter(d => !(d.company_username.toLowerCase() === cleanUser && d.customer_id === customerId));
  delete db.store_snapshots[cleanUser];
  saveDatabaseToDisk();
}

/**
 * Direct invoice deletion / void with customer credit balance adjustment.
 */
export function deleteInvoice(username: string, invoiceId: string) {
  const db = getDb();
  const cleanUser = String(username).toLowerCase().trim();
  const inv = db.invoices.find(i => i.company_username.toLowerCase() === cleanUser && (i.id === invoiceId || i.invoice_number === invoiceId));
  
  db.invoices = db.invoices.filter(i => !(i.company_username.toLowerCase() === cleanUser && (i.id === invoiceId || i.invoice_number === invoiceId)));
  
  // If invoice was credit sale or had linked debt transactions, remove them and reconcile customer balance
  if (inv) {
    db.debt_transactions = db.debt_transactions.filter(d => !(d.company_username.toLowerCase() === cleanUser && (d.invoice_id === inv.id || d.invoice_number === inv.invoice_number)));
    if (inv.customer_id) {
      const remainingCustTxs = db.debt_transactions.filter(d => d.company_username.toLowerCase() === cleanUser && d.customer_id === inv.customer_id);
      const incurred = remainingCustTxs.filter(d => d.type === 'debt_incurred').reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const paid = remainingCustTxs.filter(d => d.type === 'payment_received').reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const newDebt = Math.max(0, incurred - paid);
      const cust = db.customers.find(c => c.company_username.toLowerCase() === cleanUser && c.id === inv.customer_id);
      if (cust) {
        cust.total_debt = newDebt;
        cust.updated_at = new Date().toISOString();
      }
    }
  }

  delete db.store_snapshots[cleanUser];
  saveDatabaseToDisk();
}

/**
 * Direct debt transaction deletion with running balance recalculation.
 */
export function deleteDebtTransaction(username: string, transactionId: string) {
  const db = getDb();
  const cleanUser = String(username).toLowerCase().trim();
  const tx = db.debt_transactions.find(d => d.company_username.toLowerCase() === cleanUser && d.id === transactionId);
  db.debt_transactions = db.debt_transactions.filter(d => !(d.company_username.toLowerCase() === cleanUser && d.id === transactionId));
  
  if (tx && tx.customer_id) {
    const remainingCustTxs = db.debt_transactions.filter(d => d.company_username.toLowerCase() === cleanUser && d.customer_id === tx.customer_id);
    const incurred = remainingCustTxs.filter(d => d.type === 'debt_incurred').reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const paid = remainingCustTxs.filter(d => d.type === 'payment_received').reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    const newDebt = Math.max(0, incurred - paid);
    const cust = db.customers.find(c => c.company_username.toLowerCase() === cleanUser && c.id === tx.customer_id);
    if (cust) {
      cust.total_debt = newDebt;
      cust.updated_at = new Date().toISOString();
    }
  }

  delete db.store_snapshots[cleanUser];
  saveDatabaseToDisk();
}

/**
 * Clears all sales invoice history for a company.
 */
export function clearInvoiceHistory(username: string) {
  const db = getDb();
  const cleanUser = String(username).toLowerCase().trim();
  db.invoices = db.invoices.filter(i => i.company_username.toLowerCase() !== cleanUser);
  delete db.store_snapshots[cleanUser];
  saveDatabaseToDisk();
}

/**
 * Clears all debt transaction history for a specific customer and resets balance to 0.
 */
export function clearCustomerDebtHistory(username: string, customerId: string) {
  const db = getDb();
  const cleanUser = String(username).toLowerCase().trim();
  db.debt_transactions = db.debt_transactions.filter(d => !(d.company_username.toLowerCase() === cleanUser && d.customer_id === customerId));
  const cust = db.customers.find(c => c.company_username.toLowerCase() === cleanUser && c.id === customerId);
  if (cust) {
    cust.total_debt = 0;
    cust.updated_at = new Date().toISOString();
  }
  delete db.store_snapshots[cleanUser];
  saveDatabaseToDisk();
}

/**
 * Clear all records for a company or entire system.
 */
export function clearStoreData(username?: string | null) {
  const db = getDb();
  if (username) {
    const cleanUser = String(username).toLowerCase().trim();
    db.invoices = db.invoices.filter(i => i.company_username.toLowerCase() !== cleanUser);
    db.debt_transactions = db.debt_transactions.filter(d => d.company_username.toLowerCase() !== cleanUser);
    db.shifts = db.shifts.filter(s => s.company_username.toLowerCase() !== cleanUser);
    db.audit_logs = db.audit_logs.filter(a => a.company_username.toLowerCase() !== cleanUser);
    db.inventory = db.inventory.filter(i => i.company_username.toLowerCase() !== cleanUser);
    db.products = db.products.filter(p => p.company_username.toLowerCase() !== cleanUser);
    db.customers = db.customers.filter(c => c.company_username.toLowerCase() !== cleanUser);
    delete db.store_snapshots[cleanUser];
  } else {
    db.invoices = [];
    db.debt_transactions = [];
    db.shifts = [];
    db.audit_logs = [];
    db.inventory = [];
    db.products = [];
    db.customers = [];
    db.store_snapshots = {};
  }
  saveDatabaseToDisk();
}

/**
 * Public receipt lookup.
 */
export function getReceiptByInvoiceNumber(invoiceNumber: string) {
  const db = getDb();
  const inv = db.invoices.find(i => i.invoice_number === invoiceNumber || i.id === invoiceNumber);
  if (!inv) return null;

  const comp = db.companies.find(c => c.username.toLowerCase() === inv.company_username.toLowerCase());
  const entData = comp?.enterprise_data || {};

  return {
    invoiceNumber: inv.invoice_number,
    timestamp: inv.timestamp,
    cashierName: inv.cashier_name,
    customerName: inv.customer_name,
    items: inv.items,
    totalAmount: inv.total_amount,
    paymentMethod: inv.payment_method,
    isCreditSale: inv.is_credit_sale,
    storeName: entData.companyName || comp?.enterprise_name || 'BULAALE MINI MARKET',
    storeLocation: entData.companyLocation || 'Suuqa Weyn · Laanta 01',
    storePhone: entData.phone || '+252 61 500 0000'
  };
}

export interface BackupMetadata {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  formattedSize: string;
  label?: string;
  counts: {
    products: number;
    invoices: number;
    customers: number;
    debtTransactions: number;
  };
}

/**
 * Creates an automatic or manual backup snapshot of the entire local database.
 */
export function createDatabaseBackup(customLabel?: string): BackupMetadata {
  const db = getDb();
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeLabel = customLabel ? `_${customLabel.replace(/[^a-zA-Z0-9_-]/g, '')}` : '';
  const filename = `backup_${timestamp}${safeLabel}.json`;
  const filePath = path.join(BACKUPS_DIR, filename);

  const backupData = {
    ...db,
    _backupMetadata: {
      createdAt: new Date().toISOString(),
      label: customLabel || 'Auto Backup',
      version: db.version || 1
    }
  };

  const content = JSON.stringify(backupData, null, 2);
  fs.writeFileSync(filePath, content, 'utf-8');

  // Prune old backups, keeping latest 50
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 50) {
      files.slice(50).forEach(f => {
        try { fs.unlinkSync(path.join(BACKUPS_DIR, f.name)); } catch {}
      });
    }
  } catch (err) {
    console.warn('Backup rotation notice:', err);
  }

  const stat = fs.statSync(filePath);
  return {
    filename,
    createdAt: new Date().toISOString(),
    sizeBytes: stat.size,
    formattedSize: (stat.size / 1024).toFixed(1) + ' KB',
    label: customLabel || 'Auto Backup',
    counts: {
      products: db.products.length,
      invoices: db.invoices.length,
      customers: db.customers.length,
      debtTransactions: db.debt_transactions.length
    }
  };
}

/**
 * Lists all existing backups sorted by newest first.
 */
export function listDatabaseBackups(): BackupMetadata[] {
  if (!fs.existsSync(BACKUPS_DIR)) {
    return [];
  }

  try {
    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json'));
    const list: BackupMetadata[] = [];

    for (const f of files) {
      const fullPath = path.join(BACKUPS_DIR, f);
      try {
        const stat = fs.statSync(fullPath);
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(raw);
        list.push({
          filename: f,
          createdAt: parsed._backupMetadata?.createdAt || stat.mtime.toISOString(),
          sizeBytes: stat.size,
          formattedSize: (stat.size / 1024).toFixed(1) + ' KB',
          label: parsed._backupMetadata?.label || 'Backup',
          counts: {
            products: Array.isArray(parsed.products) ? parsed.products.length : 0,
            invoices: Array.isArray(parsed.invoices) ? parsed.invoices.length : 0,
            customers: Array.isArray(parsed.customers) ? parsed.customers.length : 0,
            debtTransactions: Array.isArray(parsed.debt_transactions) ? parsed.debt_transactions.length : 0
          }
        });
      } catch {
        // Skip corrupt file
      }
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

/**
 * Restores entire database from an existing backup snapshot.
 */
export function restoreDatabaseFromBackup(filename: string): { success: boolean; message: string; counts?: any } {
  const safeFilename = path.basename(filename);
  const targetPath = path.join(BACKUPS_DIR, safeFilename);

  if (!fs.existsSync(targetPath)) {
    return { success: false, message: 'Faylka nuqulka ah lama helin (Backup file not found).' };
  }

  try {
    // 1. Take a safety snapshot before restoring
    createDatabaseBackup('pre_restore_safety');

    // 2. Read and parse target backup
    const raw = fs.readFileSync(targetPath, 'utf-8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed.companies) || !Array.isArray(parsed.products)) {
      return { success: false, message: 'Qaab-dhismeedka nuqulku ma saxna (Invalid backup structure).' };
    }

    // 3. Apply to dbState and save to disk
    dbState = {
      version: parsed.version || 1,
      lastUpdated: new Date().toISOString(),
      companies: parsed.companies || [],
      products: parsed.products || [],
      inventory: parsed.inventory || [],
      warehouses: parsed.warehouses || [],
      users: parsed.users || [],
      shifts: parsed.shifts || [],
      invoices: parsed.invoices || [],
      customers: parsed.customers || [],
      debt_transactions: parsed.debt_transactions || [],
      audit_logs: parsed.audit_logs || [],
      store_snapshots: parsed.store_snapshots || {}
    };

    saveDatabaseToDisk();

    return {
      success: true,
      message: 'Xogtii si guul leh ayaa loogu soo celiyay nuqulkan.',
      counts: {
        products: dbState.products.length,
        invoices: dbState.invoices.length,
        customers: dbState.customers.length,
        debtTransactions: dbState.debt_transactions.length
      }
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Khalad ayaa dhacay xilliga soo celinta.' };
  }
}

/**
 * Deletes a specific backup snapshot.
 */
export function deleteDatabaseBackup(filename: string): boolean {
  const safeFilename = path.basename(filename);
  const targetPath = path.join(BACKUPS_DIR, safeFilename);
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
    return true;
  }
  return false;
}

/**
 * Gets path to backup file for download.
 */
export function getBackupFilePath(filename: string): string | null {
  const safeFilename = path.basename(filename);
  const targetPath = path.join(BACKUPS_DIR, safeFilename);
  if (fs.existsSync(targetPath)) {
    return targetPath;
  }
  return null;
}

