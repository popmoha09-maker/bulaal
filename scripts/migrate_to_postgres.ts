import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const connectionString = 
  process.env.DATABASE_URL || 
  'postgresql://postgres:ET%24vhmEQQ4t7UXN@db.eqxzxmolcvqctkgcbpxy.supabase.co:5432/postgres';

console.log('Connecting to PostgreSQL database...');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Connected! Creating tables and schemas...');

    await client.query('BEGIN');

    // 1. Companies Table
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
    `);

    // 2. Products Table
    await client.query(`
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
    `);

    // 3. Inventory Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id text PRIMARY KEY,
        company_username text NOT NULL,
        product_id text NOT NULL,
        quantity_on_hand integer NOT NULL DEFAULT 0,
        warehouse text NOT NULL DEFAULT 'w_1',
        last_restocked_at timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_comp_prod ON inventory(company_username, product_id);
    `);

    // 4. Warehouses Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id text PRIMARY KEY,
        company_username text NOT NULL,
        name text NOT NULL,
        location text DEFAULT ''
      );
    `);

    // 5. Users Table
    await client.query(`
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
    `);

    // 6. Shifts Table
    await client.query(`
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
    `);

    // 7. Invoices Table
    await client.query(`
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
    `);

    // 8. Customers Table
    await client.query(`
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
    `);

    // 9. Debt Transactions Table
    await client.query(`
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
    `);

    // 10. Audit Logs Table
    await client.query(`
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
    `);

    // 11. Store Snapshots Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_snapshots (
        company_username text PRIMARY KEY,
        state jsonb NOT NULL,
        updated_at timestamptz DEFAULT now()
      );
    `);

    console.log('Tables created successfully. Now migrating data from pos_database.json...');

    // Load data from pos_database.json
    const dbFilePath = path.join(process.cwd(), 'data', 'pos_database.json');
    if (fs.existsSync(dbFilePath)) {
      const raw = fs.readFileSync(dbFilePath, 'utf8');
      const data = JSON.parse(raw);

      // Insert Companies
      if (Array.isArray(data.companies)) {
        for (const c of data.companies) {
          await client.query(`
            INSERT INTO companies (id, username, passcode, enterprise_name, enterprise_data, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (username) DO UPDATE SET
              passcode = EXCLUDED.passcode,
              enterprise_name = EXCLUDED.enterprise_name,
              enterprise_data = EXCLUDED.enterprise_data,
              updated_at = EXCLUDED.updated_at
          `, [
            c.id || c.username,
            c.username,
            c.passcode,
            c.enterprise_name || 'BULAALE MINI MARKET',
            JSON.stringify(c.enterprise_data || {}),
            c.created_at || new Date().toISOString(),
            c.updated_at || new Date().toISOString()
          ]);
        }
        console.log(`Migrated ${data.companies.length} companies.`);
      }

      // Insert Warehouses
      if (Array.isArray(data.warehouses)) {
        for (const w of data.warehouses) {
          await client.query(`
            INSERT INTO warehouses (id, company_username, name, location)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              location = EXCLUDED.location
          `, [w.id, w.company_username || 'bulaale', w.name, w.location || '']);
        }
        console.log(`Migrated ${data.warehouses.length} warehouses.`);
      }

      // Insert Users
      if (Array.isArray(data.users)) {
        for (const u of data.users) {
          await client.query(`
            INSERT INTO users (id, company_username, username, role, pin_code, sales_count, voided_sales, avatar, jwt_token)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
              username = EXCLUDED.username,
              role = EXCLUDED.role,
              pin_code = EXCLUDED.pin_code
          `, [
            u.id,
            u.company_username || 'bulaale',
            u.username,
            u.role || 'cashier',
            u.pin_code || '1234',
            u.sales_count || 0,
            u.voided_sales || 0,
            u.avatar || '👤',
            u.jwt_token || ''
          ]);
        }
        console.log(`Migrated ${data.users.length} users.`);
      }

      // Insert Products
      if (Array.isArray(data.products)) {
        for (const p of data.products) {
          await client.query(`
            INSERT INTO products (
              id, company_username, sku, name, barcode, cost_price, retail_price, 
              category, min_stock_level, description, is_encrypted, image_url, color, size, qr_code, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (id) DO UPDATE SET
              sku = EXCLUDED.sku,
              name = EXCLUDED.name,
              barcode = EXCLUDED.barcode,
              cost_price = EXCLUDED.cost_price,
              retail_price = EXCLUDED.retail_price,
              category = EXCLUDED.category,
              min_stock_level = EXCLUDED.min_stock_level,
              description = EXCLUDED.description,
              updated_at = EXCLUDED.updated_at
          `, [
            p.id,
            p.company_username || 'bulaale',
            p.sku || `SKU-${p.id}`,
            p.name,
            p.barcode || '',
            p.cost_price || p.costPrice || 0,
            p.retail_price || p.retailPrice || 0,
            p.category || 'General',
            p.min_stock_level || p.minStockLevel || 5,
            p.description || '',
            Boolean(p.is_encrypted || p.isEncrypted),
            p.image_url || p.imageUrl || '',
            p.color || '',
            p.size || '',
            p.qr_code || p.qrCode || '',
            p.created_at || new Date().toISOString(),
            p.updated_at || new Date().toISOString()
          ]);
        }
        console.log(`Migrated ${data.products.length} products.`);
      }

      // Insert Inventory
      if (Array.isArray(data.inventory)) {
        for (const inv of data.inventory) {
          await client.query(`
            INSERT INTO inventory (id, company_username, product_id, quantity_on_hand, warehouse, last_restocked_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
              quantity_on_hand = EXCLUDED.quantity_on_hand,
              warehouse = EXCLUDED.warehouse,
              last_restocked_at = EXCLUDED.last_restocked_at
          `, [
            inv.id,
            inv.company_username || 'bulaale',
            inv.product_id || inv.productId,
            inv.quantity_on_hand !== undefined ? inv.quantity_on_hand : (inv.quantityOnHand || 0),
            inv.warehouse || 'Central Warehouse',
            inv.last_restocked_at || new Date().toISOString()
          ]);
        }
        console.log(`Migrated ${data.inventory.length} inventory records.`);
      }

      // Insert Customers
      if (Array.isArray(data.customers)) {
        for (const cust of data.customers) {
          await client.query(`
            INSERT INTO customers (id, company_username, name, phone, email, address, total_debt, credit_limit, notes, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              phone = EXCLUDED.phone,
              total_debt = EXCLUDED.total_debt,
              credit_limit = EXCLUDED.credit_limit,
              notes = EXCLUDED.notes,
              updated_at = EXCLUDED.updated_at
          `, [
            cust.id,
            cust.company_username || 'bulaale',
            cust.name,
            cust.phone,
            cust.email || null,
            cust.address || null,
            cust.total_debt || cust.totalDebt || 0,
            cust.credit_limit || cust.creditLimit || 250,
            cust.notes || null,
            cust.created_at || new Date().toISOString(),
            cust.updated_at || new Date().toISOString()
          ]);
        }
        console.log(`Migrated ${data.customers.length} customers.`);
      }

      // Insert Invoices
      if (Array.isArray(data.invoices)) {
        for (const inv of data.invoices) {
          await client.query(`
            INSERT INTO invoices (
              id, company_username, invoice_number, timestamp, user_id, cashier_name,
              items, total_amount, total_cost, payment_method, shift_id, status, is_reconciled,
              customer_id, customer_name, is_credit_sale
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (id) DO UPDATE SET
              total_amount = EXCLUDED.total_amount,
              status = EXCLUDED.status
          `, [
            inv.id,
            inv.company_username || 'bulaale',
            inv.invoice_number || inv.invoiceNumber,
            inv.timestamp || new Date().toISOString(),
            inv.user_id || inv.userId || 'admin',
            inv.cashier_name || inv.cashierName || 'Cashier',
            JSON.stringify(inv.items || []),
            inv.total_amount || inv.totalAmount || 0,
            inv.total_cost || inv.totalCost || 0,
            inv.payment_method || inv.paymentMethod || 'cash',
            inv.shift_id || inv.shiftId || '',
            inv.status || 'synced',
            Boolean(inv.is_reconciled ?? inv.isReconciled ?? true),
            inv.customer_id || inv.customerId || null,
            inv.customer_name || inv.customerName || null,
            Boolean(inv.is_credit_sale || inv.isCreditSale)
          ]);
        }
        console.log(`Migrated ${data.invoices.length} invoices.`);
      }

      // Insert Debt Transactions
      if (Array.isArray(data.debt_transactions)) {
        for (const tx of data.debt_transactions) {
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
            tx.id,
            tx.company_username || 'bulaale',
            tx.customer_id || tx.customerId,
            tx.customer_name || tx.customerName || '',
            tx.type,
            tx.amount || 0,
            tx.balance_after || tx.balanceAfter || 0,
            tx.invoice_id || tx.invoiceId || null,
            tx.invoice_number || tx.invoiceNumber || null,
            tx.notes || null,
            tx.timestamp || new Date().toISOString(),
            tx.recorded_by || tx.recordedBy || ''
          ]);
        }
        console.log(`Migrated ${data.debt_transactions.length} debt transactions.`);
      }

      // Insert Audit Logs
      if (Array.isArray(data.audit_logs)) {
        for (const log of data.audit_logs) {
          await client.query(`
            INSERT INTO audit_logs (id, company_username, timestamp, user_id, username, action, details, type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO NOTHING
          `, [
            log.id,
            log.company_username || 'bulaale',
            log.timestamp || new Date().toISOString(),
            log.user_id || log.userId || 'admin',
            log.username || 'admin',
            log.action,
            log.details,
            log.type || 'info'
          ]);
        }
        console.log(`Migrated ${data.audit_logs.length} audit logs.`);
      }

      // Insert initial store snapshot for bulaale
      const bulaaleSnapshot = {
        enterprise: data.companies?.[0]?.enterprise_data || {},
        warehouses: data.warehouses || [],
        products: data.products || [],
        inventory: data.inventory || [],
        users: data.users || [],
        shifts: data.shifts || [],
        invoices: data.invoices || [],
        customers: data.customers || [],
        debtTransactions: data.debt_transactions || [],
        auditLogs: data.audit_logs || []
      };

      await client.query(`
        INSERT INTO store_snapshots (company_username, state, updated_at)
        VALUES ($1, $2, now())
        ON CONFLICT (company_username) DO UPDATE SET
          state = EXCLUDED.state,
          updated_at = now()
      `, ['bulaale', JSON.stringify(bulaaleSnapshot)]);
    }

    await client.query('COMMIT');
    console.log('PostgreSQL migration completed successfully!');

    // Print summary verification
    const tables = ['companies', 'products', 'inventory', 'warehouses', 'users', 'invoices', 'customers', 'debt_transactions', 'audit_logs', 'store_snapshots'];
    console.log('\n--- VERIFICATION OF ROW COUNTS IN POSTGRESQL ---');
    for (const t of tables) {
      const res = await client.query(`SELECT COUNT(*) as count FROM ${t}`);
      console.log(`Table ${t}: ${res.rows[0].count} rows`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error('Migration fatal error:', err);
  process.exit(1);
});
