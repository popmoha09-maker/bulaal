import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

const connectionString = 
  process.env.DATABASE_URL || 
  process.env.SUPABASE_DB_URL || 
  'postgresql://postgres:ET%24vhmEQQ4t7UXN@db.eqxzxmolcvqctkgcbpxy.supabase.co:5432/postgres';

export const pgPool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pgPool.on('error', (err) => {
  console.warn('PostgreSQL Pool background error:', err.message);
});

/**
 * Initializes all required tables and indexes in PostgreSQL if they don't exist.
 */
export async function initPostgresTables(): Promise<boolean> {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id text PRIMARY KEY,
        username text NOT NULL UNIQUE,
        passcode text NOT NULL,
        enterprise_name text NOT NULL,
        enterprise_data jsonb DEFAULT '{}'::jsonb,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS products (
        id text PRIMARY KEY,
        company_username text NOT NULL,
        sku text NOT NULL,
        name text NOT NULL,
        barcode text DEFAULT '',
        cost_price numeric(12, 2) NOT NULL DEFAULT 0,
        retail_price numeric(12, 2) NOT NULL DEFAULT 0,
        category text NOT NULL DEFAULT 'General',
        min_stock_level integer NOT NULL DEFAULT 5,
        description text DEFAULT '',
        is_encrypted boolean DEFAULT false,
        image_url text DEFAULT '',
        color text DEFAULT '',
        size text DEFAULT '',
        qr_code text DEFAULT '',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_products_company_barcode ON products(company_username, barcode);
      CREATE INDEX IF NOT EXISTS idx_products_company_sku ON products(company_username, sku);

      CREATE TABLE IF NOT EXISTS inventory (
        id text PRIMARY KEY,
        company_username text NOT NULL,
        product_id text NOT NULL,
        quantity_on_hand integer NOT NULL DEFAULT 0,
        warehouse text NOT NULL DEFAULT 'Central Warehouse',
        last_restocked_at timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_comp_prod ON inventory(company_username, product_id);

      CREATE TABLE IF NOT EXISTS warehouses (
        id text PRIMARY KEY,
        company_username text NOT NULL,
        name text NOT NULL,
        location text DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        company_username text NOT NULL,
        username text NOT NULL,
        role text NOT NULL DEFAULT 'cashier',
        pin_code text DEFAULT '1234',
        sales_count integer DEFAULT 0,
        voided_sales integer DEFAULT 0,
        avatar text DEFAULT '👤',
        jwt_token text DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS shifts (
        id text PRIMARY KEY,
        company_username text NOT NULL,
        opened_at timestamptz NOT NULL,
        closed_at timestamptz,
        opened_by text NOT NULL,
        closed_by text,
        initial_cash numeric(12, 2) NOT NULL DEFAULT 0,
        ending_cash numeric(12, 2),
        actual_cash numeric(12, 2),
        difference numeric(12, 2),
        status text NOT NULL DEFAULT 'open'
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id text PRIMARY KEY,
        company_username text NOT NULL,
        invoice_number text NOT NULL,
        timestamp timestamptz NOT NULL,
        user_id text NOT NULL,
        cashier_name text NOT NULL,
        items jsonb NOT NULL DEFAULT '[]'::jsonb,
        total_amount numeric(12, 2) NOT NULL DEFAULT 0,
        total_cost numeric(12, 2) NOT NULL DEFAULT 0,
        payment_method text NOT NULL DEFAULT 'cash',
        shift_id text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'synced',
        is_reconciled boolean DEFAULT true,
        customer_id text,
        customer_name text,
        is_credit_sale boolean DEFAULT false
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_comp_num ON invoices(company_username, invoice_number);

      CREATE TABLE IF NOT EXISTS customers (
        id text PRIMARY KEY,
        company_username text NOT NULL,
        name text NOT NULL,
        phone text NOT NULL,
        email text,
        address text,
        total_debt numeric(12, 2) NOT NULL DEFAULT 0,
        credit_limit numeric(12, 2) NOT NULL DEFAULT 250,
        notes text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_customers_comp_phone ON customers(company_username, phone);

      CREATE TABLE IF NOT EXISTS debt_transactions (
        id text PRIMARY KEY,
        company_username text NOT NULL,
        customer_id text NOT NULL,
        customer_name text NOT NULL,
        type text NOT NULL,
        amount numeric(12, 2) NOT NULL DEFAULT 0,
        balance_after numeric(12, 2) NOT NULL DEFAULT 0,
        invoice_id text,
        invoice_number text,
        notes text,
        timestamp timestamptz DEFAULT now(),
        recorded_by text DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_debt_comp_cust ON debt_transactions(company_username, customer_id);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id text PRIMARY KEY,
        company_username text NOT NULL,
        timestamp timestamptz NOT NULL,
        user_id text NOT NULL,
        username text NOT NULL,
        action text NOT NULL,
        details text NOT NULL,
        type text NOT NULL DEFAULT 'info'
      );

      CREATE TABLE IF NOT EXISTS store_snapshots (
        company_username text PRIMARY KEY,
        state jsonb NOT NULL,
        updated_at timestamptz DEFAULT now()
      );
    `);

    await client.query('COMMIT');
    console.log('PostgreSQL tables verified successfully.');
    return true;
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Failed to init PostgreSQL tables:', err.message);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Returns connection and table health statistics from PostgreSQL.
 */
export async function getPostgresStatus() {
  const t0 = Date.now();
  try {
    const timeRes = await pgPool.query('SELECT NOW() as now');
    const latencyMs = Date.now() - t0;

    const [compRes, prodRes, invRes, custRes, invsRes, debtRes] = await Promise.all([
      pgPool.query('SELECT COUNT(*) FROM companies'),
      pgPool.query('SELECT COUNT(*) FROM products'),
      pgPool.query('SELECT COUNT(*) FROM inventory'),
      pgPool.query('SELECT COUNT(*) FROM customers'),
      pgPool.query('SELECT COUNT(*) FROM invoices'),
      pgPool.query('SELECT COUNT(*) FROM debt_transactions')
    ]);

    return {
      connected: true,
      engine: 'PostgreSQL (Supabase Cloud Database)',
      host: 'db.eqxzxmolcvqctkgcbpxy.supabase.co:5432',
      database: 'postgres',
      latencyMs,
      serverTime: timeRes.rows[0]?.now,
      counts: {
        companies: parseInt(compRes.rows[0]?.count || '0', 10),
        products: parseInt(prodRes.rows[0]?.count || '0', 10),
        inventorySlots: parseInt(invRes.rows[0]?.count || '0', 10),
        customers: parseInt(custRes.rows[0]?.count || '0', 10),
        invoices: parseInt(invsRes.rows[0]?.count || '0', 10),
        debtTransactions: parseInt(debtRes.rows[0]?.count || '0', 10)
      }
    };
  } catch (err: any) {
    return {
      connected: false,
      engine: 'PostgreSQL (Supabase Cloud Database)',
      host: 'db.eqxzxmolcvqctkgcbpxy.supabase.co:5432',
      database: 'postgres',
      latencyMs: Date.now() - t0,
      error: err.message
    };
  }
}

/**
 * Authenticates company with PostgreSQL or auto-creates if missing.
 */
export async function loginPostgresCompany(username: string, passcode: string) {
  const cleanUser = username.toLowerCase().trim();
  const cleanPass = passcode.trim();

  const res = await pgPool.query('SELECT * FROM companies WHERE username = $1', [cleanUser]);
  let company = res.rows[0];

  if (!company) {
    const storeName = `${cleanUser.toUpperCase()} STORE`;
    const enterpriseData = {
      companyName: storeName,
      companyLocation: 'Main Branch',
      warehouseName: 'Central Warehouse',
      companyCode: cleanUser.toUpperCase(),
      phone: '+252 61 500 0000',
      regDate: new Date().toISOString()
    };

    const insertRes = await pgPool.query(`
      INSERT INTO companies (id, username, passcode, enterprise_name, enterprise_data, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, now(), now())
      RETURNING *
    `, [cleanUser, cleanUser, cleanPass, storeName, JSON.stringify(enterpriseData)]);
    company = insertRes.rows[0];
  } else {
    if (company.passcode !== cleanPass) {
      return {
        success: false,
        message: 'Lambarka sirta ah waa qalad. Fadlan hubi lambarka sirta ah.'
      };
    }
  }

  const storeData = await getStoreDataFromPostgres(cleanUser);
  const sessionToken = `pg_sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  return {
    success: true,
    sessionToken,
    data: {
      username: cleanUser,
      enterpriseName: company.enterprise_name,
      data: storeData
    }
  };
}

/**
 * Retrieves all company data from PostgreSQL.
 */
export async function getStoreDataFromPostgres(username: string) {
  const cleanUser = username.toLowerCase().trim();

  const [
    compRes,
    prodRes,
    invRes,
    whRes,
    userRes,
    shiftRes,
    invsRes,
    custRes,
    debtRes,
    logRes,
    snapRes
  ] = await Promise.all([
    pgPool.query('SELECT * FROM companies WHERE username = $1', [cleanUser]),
    pgPool.query('SELECT * FROM products WHERE company_username = $1 ORDER BY name ASC', [cleanUser]),
    pgPool.query('SELECT * FROM inventory WHERE company_username = $1', [cleanUser]),
    pgPool.query('SELECT * FROM warehouses WHERE company_username = $1', [cleanUser]),
    pgPool.query('SELECT * FROM users WHERE company_username = $1', [cleanUser]),
    pgPool.query('SELECT * FROM shifts WHERE company_username = $1 ORDER BY opened_at DESC LIMIT 20', [cleanUser]),
    pgPool.query('SELECT * FROM invoices WHERE company_username = $1 ORDER BY timestamp DESC LIMIT 500', [cleanUser]),
    pgPool.query('SELECT * FROM customers WHERE company_username = $1 ORDER BY name ASC', [cleanUser]),
    pgPool.query('SELECT * FROM debt_transactions WHERE company_username = $1 ORDER BY timestamp DESC LIMIT 500', [cleanUser]),
    pgPool.query('SELECT * FROM audit_logs WHERE company_username = $1 ORDER BY timestamp DESC LIMIT 100', [cleanUser]),
    pgPool.query('SELECT * FROM store_snapshots WHERE company_username = $1', [cleanUser])
  ]);

  const company = compRes.rows[0];
  const enterprise = company?.enterprise_data || {
    companyName: company?.enterprise_name || 'BULAALE MINI MARKET',
    companyLocation: 'Suuqa Weyn · Laanta 01',
    warehouseName: 'Central Warehouse',
    companyCode: cleanUser.toUpperCase(),
    phone: '+252 61 500 0000',
    receiptFooter: 'Alaabta waxaa la soo celin karaa 3 cisho gudahood adigoo wata rasiidkan.'
  };

  return {
    enterprise,
    products: prodRes.rows.map(r => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      barcode: r.barcode || '',
      costPrice: Number(r.cost_price) || 0,
      retailPrice: Number(r.retail_price) || 0,
      category: r.category,
      minStockLevel: r.min_stock_level,
      description: r.description || '',
      isEncrypted: Boolean(r.is_encrypted),
      imageUrl: r.image_url || '',
      color: r.color || '',
      size: r.size || '',
      qrCode: r.qr_code || ''
    })),
    inventory: invRes.rows.map(r => ({
      id: r.id,
      productId: r.product_id,
      quantityOnHand: Number(r.quantity_on_hand) || 0,
      warehouse: r.warehouse,
      lastRestockedAt: r.last_restocked_at ? new Date(r.last_restocked_at).toISOString() : new Date().toISOString()
    })),
    warehouses: whRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      location: r.location
    })),
    users: userRes.rows.map(r => ({
      id: r.id,
      username: r.username,
      role: r.role,
      pinCode: r.pin_code,
      salesCount: r.sales_count,
      voidedSales: r.voided_sales,
      avatar: r.avatar
    })),
    shifts: shiftRes.rows.map(r => ({
      id: r.id,
      openedAt: r.opened_at ? new Date(r.opened_at).toISOString() : new Date().toISOString(),
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
      openedBy: r.opened_by,
      closedBy: r.closed_by,
      initialCash: Number(r.initial_cash) || 0,
      endingCash: r.ending_cash != null ? Number(r.ending_cash) : null,
      actualCash: r.actual_cash != null ? Number(r.actual_cash) : null,
      difference: r.difference != null ? Number(r.difference) : null,
      status: r.status
    })),
    invoices: invsRes.rows.map(r => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
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
    customers: custRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      totalDebt: Number(r.total_debt) || 0,
      creditLimit: Number(r.credit_limit) || 250,
      notes: r.notes,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()
    })),
    debtTransactions: debtRes.rows.map(r => ({
      id: r.id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      type: r.type,
      amount: Number(r.amount) || 0,
      balanceAfter: Number(r.balance_after) || 0,
      invoiceId: r.invoice_id,
      invoiceNumber: r.invoice_number,
      notes: r.notes,
      timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
      recordedBy: r.recorded_by
    })),
    auditLogs: logRes.rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
      userId: r.user_id,
      username: r.username,
      action: r.action,
      details: r.details,
      type: r.type
    }))
  };
}

/**
 * Saves and synchronizes store state to PostgreSQL.
 */
export async function syncStoreDataToPostgres(username: string, payload: any) {
  const cleanUser = username.toLowerCase().trim();
  const client = await pgPool.connect();

  try {
    await client.query('BEGIN');

    // 1. Update enterprise metadata in companies table
    if (payload.enterprise) {
      await client.query(`
        INSERT INTO companies (id, username, passcode, enterprise_name, enterprise_data, updated_at)
        VALUES ($1, $2, '1234', $3, $4, now())
        ON CONFLICT (username) DO UPDATE SET
          enterprise_name = EXCLUDED.enterprise_name,
          enterprise_data = EXCLUDED.enterprise_data,
          updated_at = now()
      `, [
        cleanUser,
        cleanUser,
        payload.enterprise.companyName || 'BULAALE MINI MARKET',
        JSON.stringify(payload.enterprise)
      ]);
    }

    // 2. Save complete snapshot
    await client.query(`
      INSERT INTO store_snapshots (company_username, state, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (company_username) DO UPDATE SET
        state = EXCLUDED.state,
        updated_at = now()
    `, [cleanUser, JSON.stringify(payload)]);

    // 3. Upsert products if provided
    if (Array.isArray(payload.products)) {
      for (const p of payload.products) {
        await client.query(`
          INSERT INTO products (
            id, company_username, sku, name, barcode, cost_price, retail_price,
            category, min_stock_level, description, is_encrypted, image_url, color, size, qr_code, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
          ON CONFLICT (id) DO UPDATE SET
            sku = EXCLUDED.sku,
            name = EXCLUDED.name,
            barcode = EXCLUDED.barcode,
            cost_price = EXCLUDED.cost_price,
            retail_price = EXCLUDED.retail_price,
            category = EXCLUDED.category,
            min_stock_level = EXCLUDED.min_stock_level,
            description = EXCLUDED.description,
            updated_at = now()
        `, [
          p.id,
          cleanUser,
          p.sku || `SKU-${p.id}`,
          p.name,
          p.barcode || '',
          p.costPrice || 0,
          p.retailPrice || 0,
          p.category || 'General',
          p.minStockLevel || 5,
          p.description || '',
          Boolean(p.isEncrypted),
          p.imageUrl || '',
          p.color || '',
          p.size || '',
          p.qrCode || ''
        ]);
      }
    }

    // 4. Upsert inventory if provided
    if (Array.isArray(payload.inventory)) {
      for (const inv of payload.inventory) {
        await client.query(`
          INSERT INTO inventory (id, company_username, product_id, quantity_on_hand, warehouse, last_restocked_at)
          VALUES ($1, $2, $3, $4, $5, now())
          ON CONFLICT (id) DO UPDATE SET
            quantity_on_hand = EXCLUDED.quantity_on_hand,
            warehouse = EXCLUDED.warehouse,
            last_restocked_at = now()
        `, [
          inv.id,
          cleanUser,
          inv.productId,
          inv.quantityOnHand || 0,
          inv.warehouse || 'Central Warehouse'
        ]);
      }
    }

    // 5. Upsert customers if provided
    if (Array.isArray(payload.customers)) {
      for (const c of payload.customers) {
        await client.query(`
          INSERT INTO customers (id, company_username, name, phone, email, address, total_debt, credit_limit, notes, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            total_debt = EXCLUDED.total_debt,
            credit_limit = EXCLUDED.credit_limit,
            notes = EXCLUDED.notes,
            updated_at = now()
        `, [
          c.id,
          cleanUser,
          c.name,
          c.phone || '',
          c.email || null,
          c.address || null,
          c.totalDebt || 0,
          c.creditLimit || 250,
          c.notes || null
        ]);
      }
    }

    // 6. Upsert debt transactions
    if (Array.isArray(payload.debtTransactions)) {
      for (const dt of payload.debtTransactions) {
        await client.query(`
          INSERT INTO debt_transactions (
            id, company_username, customer_id, customer_name, type, amount,
            balance_after, invoice_id, invoice_number, notes, timestamp, recorded_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            amount = EXCLUDED.amount,
            balance_after = EXCLUDED.balance_after
        `, [
          dt.id,
          cleanUser,
          dt.customerId,
          dt.customerName || '',
          dt.type,
          dt.amount || 0,
          dt.balanceAfter || 0,
          dt.invoiceId || null,
          dt.invoiceNumber || null,
          dt.notes || null,
          dt.timestamp || new Date().toISOString(),
          dt.recordedBy || ''
        ]);
      }
    }

    await client.query('COMMIT');
    return { success: true, message: 'Saved and synchronized to PostgreSQL.' };
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Failed to sync to PostgreSQL:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Searches product by barcode or SKU in PostgreSQL.
 */
export async function lookupProductInPostgres(username: string, query: string) {
  const cleanUser = username.toLowerCase().trim();
  const cleanCode = query.trim().toLowerCase();

  const res = await pgPool.query(`
    SELECT p.*, COALESCE(i.quantity_on_hand, 0) as stock
    FROM products p
    LEFT JOIN inventory i ON p.id = i.product_id AND i.company_username = p.company_username
    WHERE p.company_username = $1
      AND (
        LOWER(p.barcode) = $2 OR
        LOWER(p.sku) = $2 OR
        LOWER(p.qr_code) = $2 OR
        LOWER(p.name) = $2
      )
    LIMIT 1
  `, [cleanUser, cleanCode]);

  if (res.rows.length === 0) {
    return { found: false, stock: 0 };
  }

  const r = res.rows[0];
  return {
    found: true,
    product: {
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
    },
    stock: parseInt(r.stock, 10) || 0
  };
}

/**
 * Saves a new product and initial inventory atomically in PostgreSQL.
 */
export async function saveProductInPostgres(
  username: string, 
  product: any, 
  initialStock: number = 0, 
  warehouseId?: string
) {
  const cleanUser = username.toLowerCase().trim();
  const productId = product.id || `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const inventoryId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const warehouse = warehouseId || 'Central Warehouse';

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    const insertProd = await client.query(`
      INSERT INTO products (
        id, company_username, sku, name, barcode, cost_price, retail_price,
        category, min_stock_level, description, is_encrypted, image_url, color, size, qr_code, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now(), now())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        barcode = EXCLUDED.barcode,
        cost_price = EXCLUDED.cost_price,
        retail_price = EXCLUDED.retail_price,
        category = EXCLUDED.category,
        updated_at = now()
      RETURNING *
    `, [
      productId,
      cleanUser,
      product.sku || `SKU-${Date.now().toString().slice(-4)}`,
      product.name,
      product.barcode || '',
      product.costPrice || 0,
      product.retailPrice || 0,
      product.category || 'General',
      product.minStockLevel || 5,
      product.description || '',
      Boolean(product.isEncrypted),
      product.imageUrl || '',
      product.color || '',
      product.size || '',
      product.qrCode || ''
    ]);

    const insertInv = await client.query(`
      INSERT INTO inventory (id, company_username, product_id, quantity_on_hand, warehouse, last_restocked_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (id) DO UPDATE SET
        quantity_on_hand = EXCLUDED.quantity_on_hand,
        last_restocked_at = now()
      RETURNING *
    `, [
      inventoryId,
      cleanUser,
      productId,
      initialStock,
      warehouse
    ]);

    // Add audit log
    await client.query(`
      INSERT INTO audit_logs (id, company_username, timestamp, user_id, username, action, details, type)
      VALUES ($1, $2, now(), $3, $4, $5, $6, 'success')
    `, [
      `log_${Date.now()}`,
      cleanUser,
      'cashier',
      cleanUser,
      'Diiwaangelin Alaab',
      `Alaab cusub "${product.name}" (#${product.barcode || product.sku}) ayaa la diiwaangeliyay PostgreSQL. Kaydka bilowga: ${initialStock}.`
    ]);

    await client.query('COMMIT');

    const p = insertProd.rows[0];
    const inv = insertInv.rows[0];

    return {
      success: true,
      product: {
        id: p.id,
        sku: p.sku,
        name: p.name,
        barcode: p.barcode,
        costPrice: Number(p.cost_price),
        retailPrice: Number(p.retail_price),
        category: p.category,
        minStockLevel: p.min_stock_level,
        description: p.description,
        isEncrypted: Boolean(p.is_encrypted),
        imageUrl: p.image_url,
        color: p.color,
        size: p.size,
        qrCode: p.qr_code
      },
      inventory: {
        id: inv.id,
        productId: inv.product_id,
        quantityOnHand: parseInt(inv.quantity_on_hand, 10),
        warehouse: inv.warehouse,
        lastRestockedAt: inv.last_restocked_at
      }
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Failed to save product in PostgreSQL:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Executes a sale transaction atomically in PostgreSQL:
 * 1. Checks and deducts inventory quantities.
 * 2. Records invoice row.
 * 3. If credit sale, updates customer debt and records debt transaction.
 * 4. Logs audit trail.
 */
export async function executeSaleInPostgres(username: string, sale: any) {
  const cleanUser = username.toLowerCase().trim();
  const invoiceId = `inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const invoiceNumber = sale.invoiceNumber || `INV-${Date.now().toString().slice(-8)}`;

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Deduct Inventory
    const updatedInventoryList: any[] = [];
    if (Array.isArray(sale.items)) {
      for (const item of sale.items) {
        const prodId = item.productId;
        const qtyToDeduct = parseInt(item.quantity, 10) || 1;

        const invRes = await client.query(`
          UPDATE inventory
          SET quantity_on_hand = GREATEST(0, quantity_on_hand - $1),
              last_restocked_at = now()
          WHERE company_username = $2 AND product_id = $3
          RETURNING *
        `, [qtyToDeduct, cleanUser, prodId]);

        if (invRes.rows.length > 0) {
          const invRow = invRes.rows[0];
          updatedInventoryList.push({
            id: invRow.id,
            productId: invRow.product_id,
            quantityOnHand: parseInt(invRow.quantity_on_hand, 10),
            warehouse: invRow.warehouse,
            lastRestockedAt: invRow.last_restocked_at
          });
        }
      }
    }

    // 2. Insert Invoice
    const invoiceRes = await client.query(`
      INSERT INTO invoices (
        id, company_username, invoice_number, timestamp, user_id, cashier_name,
        items, total_amount, total_cost, payment_method, shift_id, status, is_reconciled,
        customer_id, customer_name, is_credit_sale
      )
      VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10, 'synced', true, $11, $12, $13)
      RETURNING *
    `, [
      invoiceId,
      cleanUser,
      invoiceNumber,
      sale.userId || 'cashier',
      sale.cashierName || 'Cashier',
      JSON.stringify(sale.items || []),
      sale.totalAmount || 0,
      sale.totalCost || 0,
      sale.paymentMethod || (sale.isCreditSale ? 'credit' : 'cash'),
      sale.shiftId || '',
      sale.customerId || null,
      sale.customerName || null,
      Boolean(sale.isCreditSale)
    ]);

    // 3. Handle Credit Sale
    let updatedCustomer: any = null;
    if (sale.isCreditSale && sale.customerId) {
      const custRes = await client.query(`
        UPDATE customers
        SET total_debt = total_debt + $1,
            updated_at = now()
        WHERE id = $2 AND company_username = $3
        RETURNING *
      `, [sale.totalAmount, sale.customerId, cleanUser]);

      if (custRes.rows.length > 0) {
        updatedCustomer = custRes.rows[0];

        // Insert Debt Transaction
        await client.query(`
          INSERT INTO debt_transactions (
            id, company_username, customer_id, customer_name, type, amount,
            balance_after, invoice_id, invoice_number, notes, timestamp, recorded_by
          )
          VALUES ($1, $2, $3, $4, 'debt_incurred', $5, $6, $7, $8, $9, now(), $10)
        `, [
          `dt_${Date.now()}`,
          cleanUser,
          sale.customerId,
          sale.customerName || updatedCustomer.name,
          sale.totalAmount,
          Number(updatedCustomer.total_debt),
          invoiceId,
          invoiceNumber,
          `Iib deyn ah #${invoiceNumber}`,
          sale.cashierName || 'Cashier'
        ]);
      }
    }

    // 4. Record Audit Log
    await client.query(`
      INSERT INTO audit_logs (id, company_username, timestamp, user_id, username, action, details, type)
      VALUES ($1, $2, now(), $3, $4, 'Iib Cusub', $5, 'success')
    `, [
      `log_${Date.now()}`,
      cleanUser,
      sale.userId || 'cashier',
      sale.cashierName || 'Cashier',
      `Waxaa la fuliyay iibka #${invoiceNumber} oo ah $${Number(sale.totalAmount).toFixed(2)} (${sale.isCreditSale ? 'Deyn' : 'Caddaan'}).`
    ]);

    await client.query('COMMIT');

    const inv = invoiceRes.rows[0];
    return {
      success: true,
      invoice: {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        timestamp: inv.timestamp,
        userId: inv.user_id,
        cashierName: inv.cashier_name,
        items: inv.items,
        totalAmount: Number(inv.total_amount),
        totalCost: Number(inv.total_cost),
        paymentMethod: inv.payment_method,
        shiftId: inv.shift_id,
        status: inv.status,
        isReconciled: Boolean(inv.is_reconciled),
        customerId: inv.customer_id,
        customerName: inv.customer_name,
        isCreditSale: Boolean(inv.is_credit_sale)
      },
      updatedInventory: updatedInventoryList,
      updatedCustomer: updatedCustomer ? {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        totalDebt: Number(updatedCustomer.total_debt)
      } : null
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Failed to execute sale in PostgreSQL:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Direct delete helpers
 */
export async function deleteProductInPostgres(username: string, productId: string) {
  const cleanUser = username.toLowerCase().trim();
  await pgPool.query('DELETE FROM products WHERE company_username = $1 AND id = $2', [cleanUser, productId]);
  await pgPool.query('DELETE FROM inventory WHERE company_username = $1 AND product_id = $2', [cleanUser, productId]);
}

export async function deleteCustomerInPostgres(username: string, customerId: string) {
  const cleanUser = username.toLowerCase().trim();
  await pgPool.query('DELETE FROM customers WHERE company_username = $1 AND id = $2', [cleanUser, customerId]);
  await pgPool.query('DELETE FROM debt_transactions WHERE company_username = $1 AND customer_id = $2', [cleanUser, customerId]);
}

export async function deleteInvoiceInPostgres(username: string, invoiceId: string) {
  const cleanUser = username.toLowerCase().trim();
  await pgPool.query('DELETE FROM invoices WHERE company_username = $1 AND id = $2', [cleanUser, invoiceId]);
}

export async function deleteDebtInPostgres(username: string, transactionId: string) {
  const cleanUser = username.toLowerCase().trim();
  await pgPool.query('DELETE FROM debt_transactions WHERE company_username = $1 AND id = $2', [cleanUser, transactionId]);
}

export async function clearInvoicesInPostgres(username: string) {
  const cleanUser = username.toLowerCase().trim();
  await pgPool.query('DELETE FROM invoices WHERE company_username = $1', [cleanUser]);
  return { success: true, message: 'All invoices cleared from PostgreSQL' };
}

export async function clearCustomerDebtsInPostgres(username: string, customerId: string) {
  const cleanUser = username.toLowerCase().trim();
  await pgPool.query('DELETE FROM debt_transactions WHERE company_username = $1 AND customer_id = $2', [cleanUser, customerId]);
  await pgPool.query('UPDATE customers SET total_debt = 0 WHERE company_username = $1 AND id = $2', [cleanUser, customerId]);
  return { success: true, message: 'Customer debts cleared in PostgreSQL' };
}
