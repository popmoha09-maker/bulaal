import "dotenv/config";
import express from "express";
import path from "path";
import os from "os";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import {
  initLocalDatabase,
  getLocalDatabaseStatus,
  loginLocalCompany,
  getStoreDataForCompany,
  syncStoreDataForCompany,
  deleteProduct,
  deleteCustomer,
  deleteInvoice,
  deleteDebtTransaction,
  clearInvoiceHistory,
  clearCustomerDebtHistory,
  clearStoreData,
  getReceiptByInvoiceNumber,
  createDatabaseBackup,
  listDatabaseBackups,
  restoreDatabaseFromBackup,
  deleteDatabaseBackup,
  getBackupFilePath,
  lookupProductInDb,
  saveProductAtomically,
  executeAtomicSale
} from "./src/db/localDb";
import {
  initPostgresTables,
  getPostgresStatus,
  loginPostgresCompany,
  getStoreDataFromPostgres,
  syncStoreDataToPostgres,
  saveProductInPostgres,
  lookupProductInPostgres,
  executeSaleInPostgres,
  deleteProductInPostgres,
  deleteCustomerInPostgres,
  deleteInvoiceInPostgres,
  deleteDebtInPostgres,
  clearInvoicesInPostgres,
  clearCustomerDebtsInPostgres
} from "./src/db/postgresDb";

const app = express();
const PORT =
  process.env.NODE_ENV === "production" && !process.env.NGINX_PORT && process.env.PORT
    ? Number(process.env.PORT) || 3000
    : 3000;

app.use(express.json({ limit: '50mb' }));

/**
 * Returns network IPv4 interfaces for Wi-Fi Hotspot & local network device connection.
 */
function getLocalNetworkInfo(port: number) {
  const interfaces = os.networkInterfaces();
  const list: { ip: string; name: string; type: string; url: string }[] = [];
  
  for (const [name, netList] of Object.entries(interfaces)) {
    if (!netList) continue;
    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        let type = 'Wi-Fi / LAN';
        const lower = name.toLowerCase();
        if (lower.includes('wi-fi') || lower.includes('wlan') || lower.includes('wireless') || lower.includes('hotspot')) {
          type = 'Wi-Fi / Hotspot';
        } else if (lower.includes('eth') || lower.includes('ethernet')) {
          type = 'Ethernet (Cable)';
        }
        list.push({
          ip: net.address,
          name,
          type,
          url: `http://${net.address}:${port}`
        });
      }
    }
  }

  // Filter out any virtual interfaces if real Wi-Fi/LAN exist
  const sorted = [...list].sort((a, b) => {
    if (a.type.includes('Wi-Fi') && !b.type.includes('Wi-Fi')) return -1;
    if (!a.type.includes('Wi-Fi') && b.type.includes('Wi-Fi')) return 1;
    return 0;
  });

  return {
    port,
    localhostUrl: `http://localhost:${port}`,
    devices: sorted,
    primaryUrl: sorted[0] ? sorted[0].url : `http://localhost:${port}`
  };
}

// Server-Sent Events (SSE) for Real-Time Multi-Device Sync
interface SSEClient {
  id: string;
  username?: string;
  res: express.Response;
}

const sseClients = new Set<SSEClient>();

/**
 * Broadcasts data changes immediately to all connected browsers (Cashier PC & Phones).
 */
function broadcastSyncEvent(username: string, changeType: string = 'SYNC_UPDATE', senderId?: string | null) {
  const payload = JSON.stringify({
    type: changeType,
    username,
    senderId: senderId || null,
    timestamp: Date.now()
  });

  for (const client of sseClients) {
    try {
      if (!client.username || client.username.toLowerCase() === username.toLowerCase() || username === 'all') {
        client.res.write(`data: ${payload}\n\n`);
      }
    } catch {
      sseClients.delete(client);
    }
  }
}

// 1. Health API
app.get("/api/health", (_req, res) => {
  res.json({ 
    status: "ok", 
    service: "BULAALE MINI MARKET", 
    database: "Local Disk Database (100% Offline)",
    mode: "Local Server"
  });
});

// 2. Local Network & Wi-Fi Hotspot Info API
app.get("/api/network/info", (_req, res) => {
  const netInfo = getLocalNetworkInfo(PORT);
  res.json({
    success: true,
    ...netInfo,
    connectedDevicesCount: sseClients.size
  });
});

// 3. Real-Time Server-Sent Events (SSE) Stream
app.get("/api/db/stream", (req, res) => {
  const username = req.query.username ? String(req.query.username).toLowerCase().trim() : undefined;
  
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const client: SSEClient = { id: clientId, username, res };
  sseClients.add(client);

  // Send initial handshake
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId, timestamp: Date.now() })}\n\n`);

  // Heartbeat keep-alive every 20 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(client);
    }
  }, 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
  });
});

// 4. Gemini AI Intelligent Excel & CSV Spreadsheet Analysis API (with offline heuristic fallback)
app.post("/api/gemini/analyze-excel", async (req, res) => {
  const { headers, sampleRows, totalRows } = req.body;
  if (!headers || !Array.isArray(headers) || headers.length === 0) {
    return res.status(400).json({ success: false, message: "Headers array is required." });
  }

  // Multi-lingual heuristic matcher fallback (works 100% offline)
  const runHeuristicAnalysis = () => {
    const normArabic = (s: string) => {
      return String(s || '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/\u0640/g, '')
        .toLowerCase()
        .trim()
        .replace(/[\s\-_]/g, '');
    };

    const mapping: Record<string, string> = {};
    const normHeaders = headers.map(h => ({ raw: h, norm: normArabic(h) }));

    const findMatch = (keywords: string[], exclude: string[] = []) => {
      for (const item of normHeaders) {
        if (exclude.includes(item.raw)) continue;
        for (const kw of keywords) {
          const normKw = normArabic(kw);
          if (item.norm === normKw || item.norm.includes(normKw)) {
            return item.raw;
          }
        }
      }
      return undefined;
    };

    // 1. Name
    mapping.name = findMatch([
      'اسم المنتج', 'اسم الصنف', 'المنتج', 'الصنف', 'المادة', 'اسم', 'الوصف', 'بيان',
      'product name', 'item name', 'product', 'item', 'title', 'magaca alaabta', 'magac'
    ]) || headers[0];

    // 2. Barcode
    const barcodeMatch = findMatch([
      'باركود', 'الباركود', 'كود الصنف', 'رمز الصنف', 'رقم الباركود', 'باركود الصنف', 'كود', 'الكود', 'رمز', 'الرمز',
      'barcode', 'bar code', 'ean', 'ean13', 'upc', 'barkoodh', 'barkoodhka'
    ], [mapping.name]);
    if (barcodeMatch) mapping.barcode = barcodeMatch;

    // 3. Cost / Purchase Price
    const costMatch = findMatch([
      'سعر الشراء', 'سعر شراء', 'سعر التكلفة', 'سعر التكلفه', 'سعر الكلفة', 'التكلفة', 'التكلفه',
      'شراء', 'الشراء', 'تكلفة', 'تكلفه', 'كلفة', 'ثمن الشراء', 'قيمة الشراء', 'سعر جملة', 'الجملة',
      'cost price', 'cost', 'purchase price', 'purchase', 'buy price', 'buy', 'qiimaha sooiibsiga', 'sooiib'
    ], [mapping.name, mapping.barcode || '']);
    if (costMatch) mapping.costPrice = costMatch;

    // 4. Retail / Selling Price
    const retailMatch = findMatch([
      'سعر البيع', 'سعر بيع', 'سعر المفرد', 'سعر التجزئة', 'سعر التجزئه', 'سعر القطعة', 'سعر القطعه',
      'سعر الوحده', 'سعر الوحدة', 'سعر المستهلك', 'سعر الجمهور', 'بيع', 'البيع', 'تجزئة', 'مفرد', 'قطاعي',
      'retail price', 'selling price', 'sell price', 'sale price', 'unit price', 'rate', 'qiimaha iibka'
    ], [mapping.name, mapping.barcode || '', mapping.costPrice || '']);
    if (retailMatch) mapping.retailPrice = retailMatch;

    if (!mapping.retailPrice) {
      const genericPrice = findMatch(
        ['السعر', 'سعر', 'price', 'qiimo', 'qiimaha', 'الثمن', 'ثمن', 'القيمة', 'المبلغ'],
        [mapping.name, mapping.barcode || '', mapping.costPrice || '']
      );
      if (genericPrice) mapping.retailPrice = genericPrice;
    }

    // 5. Quantity on Hand
    const qtyMatch = findMatch([
      'الكمية', 'الكميه', 'كمية', 'كميه', 'المخزون', 'مخزون', 'الرصيد', 'رصيد', 'العدد', 'عدد', 'المتوفر',
      'qty', 'quantity', 'stock', 'on hand', 'onhand', 'balance', 'count', 'tirada', 'kaydka'
    ], [mapping.name, mapping.barcode || '', mapping.costPrice || '', mapping.retailPrice || '']);
    if (qtyMatch) mapping.quantityOnHand = qtyMatch;

    // 6. Category
    const catMatch = findMatch([
      'القسم', 'قسم', 'التصنيف', 'تصنيف', 'الفئة', 'فئة', 'النوع', 'نوع', 'المجموعة',
      'category', 'dept', 'department', 'group', 'qayb', 'qaybta'
    ], [mapping.name, mapping.barcode || '', mapping.costPrice || '', mapping.retailPrice || '', mapping.quantityOnHand || '']);
    if (catMatch) mapping.category = catMatch;

    return {
      success: true,
      provider: "heuristic",
      columnMapping: mapping,
      confidence: Object.keys(mapping).length >= 3 ? "high" : "medium",
      explanation: "Analysis performed via enhanced Arabic, Somali and English retail column detection.",
      warnings: []
    };
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return res.json(runHeuristicAnalysis());
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const prompt = `You are an expert POS and ERP retail spreadsheet ingestion specialist.
You must analyze the headers and sample rows from an uploaded Excel/CSV file to map the spreadsheet columns to standard POS inventory database fields.

Spreadsheet Information:
- Total Columns: ${headers.length}
- Column Headers: ${JSON.stringify(headers)}
- Sample Data Rows (first few rows):
${JSON.stringify((sampleRows || []).slice(0, 6), null, 2)}
- Total Rows in file: ${totalRows || 'unknown'}

Target POS Fields to identify:
1. "name": Product name/title (MANDATORY). Examples: Item Name, Description, Product, اسم المنتج, Magaca Alaabta.
2. "barcode": Barcode, EAN, UPC, Code 128. Examples: Barcode, EAN13, الباركود, Baarkoodhka.
3. "costPrice": Purchase/Cost price. Examples: Cost, Cost Price, Purchase Price, سعر الشراء, Qiimaha Soo Iibsiga.
4. "retailPrice": Selling/Retail price. Examples: Price, Retail Price, Selling Price, سعر البيع, Qiimaha Iibka.
5. "quantityOnHand": Stock quantity. Examples: Quantity, Qty, Stock, On Hand, Count, الكمية, Tirada Kaydka.
6. "category": Product department/category. Examples: Category, Group, Section, القسم, Qaybta.
7. "sku": Product SKU or item code. Examples: SKU, Code, Item Code, الرمز.
8. "minStockLevel": Low stock alert threshold. Examples: Min Stock, Alert Level, Low Alert, الحد الأدنى.
9. "description": Detailed description or notes.

Instructions:
- Examine the actual values in the sample rows to verify your mapping.
- Match even if column names are in Arabic, Somali, English, French, abbreviations, or misspelled.
- If a target field is not present in the spreadsheet, set its mapped column to null or empty string. Do NOT invent columns that don't exist in the headers list.
- Return a valid JSON object matching the requested schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            columnMapping: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Header for product name" },
                barcode: { type: Type.STRING, description: "Header for barcode" },
                costPrice: { type: Type.STRING, description: "Header for cost price" },
                retailPrice: { type: Type.STRING, description: "Header for retail price" },
                quantityOnHand: { type: Type.STRING, description: "Header for stock quantity" },
                category: { type: Type.STRING, description: "Header for category" },
                sku: { type: Type.STRING, description: "Header for SKU" },
                minStockLevel: { type: Type.STRING, description: "Header for low stock alert" },
                description: { type: Type.STRING, description: "Header for description" }
              }
            },
            confidence: { type: Type.STRING, description: "Confidence level: high, medium, or low" },
            explanation: { type: Type.STRING, description: "Short explanation of the mapping decisions" },
            warnings: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Any potential data issues noticed in the sample rows"
            }
          },
          required: ["columnMapping", "confidence", "explanation"]
        }
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({
      success: true,
      provider: "gemini-2.5-flash",
      columnMapping: parsed.columnMapping || {},
      confidence: parsed.confidence || "high",
      explanation: parsed.explanation || "Analyzed via Gemini AI",
      warnings: parsed.warnings || []
    });
  } catch (err: any) {
    console.error("Gemini Excel Analysis notice (falling back to local heuristic):", err.message);
    const fallback = runHeuristicAnalysis();
    return res.json(fallback);
  }
});

// 5. Public Receipt API for Customer QR Scans (View-only)
app.get("/api/public/receipt/:invoiceNumber", (req, res) => {
  const invNumber = String(req.params.invoiceNumber || '').trim();
  if (!invNumber) {
    return res.status(400).json({ success: false, message: "Invoice number required" });
  }

  const receipt = getReceiptByInvoiceNumber(invNumber);
  if (!receipt) {
    return res.status(404).json({ success: false, message: "Rasiidkan lagama helin diiwaanka." });
  }

  res.json({
    success: true,
    receipt
  });
});

// 5b. Product Barcode / SKU Database Lookup API
app.get("/api/db/product/lookup", async (req, res) => {
  const username = String(req.query.username || 'bulaale').toLowerCase().trim();
  const query = String(req.query.barcode || req.query.query || '').trim();

  if (!query) {
    return res.status(400).json({ success: false, message: "Query / barcode parameter is required" });
  }

  try {
    const pgResult = await lookupProductInPostgres(username, query);
    if (pgResult.found) {
      return res.json({ success: true, ...pgResult });
    }
  } catch (e: any) {
    console.warn("Postgres lookup notice, checking local cache:", e?.message);
  }

  try {
    const localResult = lookupProductInDb(username, query);
    res.json({ success: true, ...localResult });
  } catch (err: any) {
    console.error("Product lookup error:", err);
    res.status(500).json({ success: false, message: err?.message || "Lookup failed" });
  }
});

// 5c. Atomic Product Creation API (Validates, persists to PostgreSQL with initial stock, and broadcasts)
app.post("/api/db/product", async (req, res) => {
  const { username, product, initialStock, warehouseId } = req.body;
  if (!username || !product) {
    return res.status(400).json({ success: false, message: "Username and product data are required" });
  }

  const cleanUser = String(username).toLowerCase().trim();
  const senderId = (req.headers['x-client-id'] as string) || req.body?.clientId || null;

  try {
    const pgResult = await saveProductInPostgres(cleanUser, product, initialStock, warehouseId);
    // Also mirror to local disk backup
    try { saveProductAtomically(cleanUser, product, initialStock, warehouseId); } catch {}
    broadcastSyncEvent(cleanUser, 'PRODUCT_CREATED', senderId);
    return res.json(pgResult);
  } catch (err: any) {
    console.warn("Postgres product save notice, using local backup:", err?.message);
    try {
      const localResult = saveProductAtomically(cleanUser, product, initialStock, warehouseId);
      broadcastSyncEvent(cleanUser, 'PRODUCT_CREATED', senderId);
      return res.json(localResult);
    } catch (localErr: any) {
      res.status(400).json({ success: false, message: localErr?.message || "Failed to save product" });
    }
  }
});

// 5d. Atomic Sale Execution API (Atomically deducts inventory, records invoice & customer debt)
app.post("/api/db/sale", async (req, res) => {
  const { username, sale } = req.body;
  if (!username || !sale) {
    return res.status(400).json({ success: false, message: "Username and sale data are required" });
  }

  const cleanUser = String(username).toLowerCase().trim();
  const senderId = (req.headers['x-client-id'] as string) || req.body?.clientId || null;

  try {
    const pgResult = await executeSaleInPostgres(cleanUser, sale);
    // Also mirror to local disk backup
    try { executeAtomicSale(cleanUser, sale); } catch {}
    broadcastSyncEvent(cleanUser, 'SALE_COMPLETED', senderId);
    return res.json(pgResult);
  } catch (err: any) {
    console.warn("Postgres sale notice, using local transaction:", err?.message);
    try {
      const localResult = executeAtomicSale(cleanUser, sale);
      broadcastSyncEvent(cleanUser, 'SALE_COMPLETED', senderId);
      return res.json(localResult);
    } catch (localErr: any) {
      res.status(400).json({ success: false, message: localErr?.message || "Sale transaction failed" });
    }
  }
});

// 6. Direct Product Delete API
app.delete("/api/db/product/:username/:productId", async (req, res) => {
  const { username, productId } = req.params;
  const cleanUser = String(username).toLowerCase().trim();
  const senderId = (req.headers['x-client-id'] as string) || (req.query.clientId as string) || null;
  try {
    await deleteProductInPostgres(cleanUser, productId);
  } catch (e: any) {
    console.warn("Postgres product delete notice:", e?.message);
  }

  try {
    deleteProduct(cleanUser, productId);
    broadcastSyncEvent(cleanUser, 'PRODUCT_DELETED', senderId);
    res.json({ success: true, message: "Product deleted from database" });
  } catch (err: any) {
    console.error("Product delete error:", err);
    res.status(500).json({ success: false, message: err?.message || "Delete failed" });
  }
});

// 7. Direct Customer Delete API
app.delete("/api/db/customer/:username/:customerId", async (req, res) => {
  const { username, customerId } = req.params;
  const cleanUser = String(username).toLowerCase().trim();
  const senderId = (req.headers['x-client-id'] as string) || (req.query.clientId as string) || null;
  try {
    await deleteCustomerInPostgres(cleanUser, customerId);
  } catch (e: any) {
    console.warn("Postgres customer delete notice:", e?.message);
  }

  try {
    deleteCustomer(cleanUser, customerId);
    broadcastSyncEvent(cleanUser, 'CUSTOMER_DELETED', senderId);
    res.json({ success: true, message: "Customer deleted from database" });
  } catch (err: any) {
    console.error("Customer delete error:", err);
    res.status(500).json({ success: false, message: err?.message || "Delete failed" });
  }
});

// 8. Direct Invoice Delete / Void API
app.delete("/api/db/invoice/:username/:invoiceId", async (req, res) => {
  const { username, invoiceId } = req.params;
  const cleanUser = String(username).toLowerCase().trim();
  const senderId = (req.headers['x-client-id'] as string) || (req.query.clientId as string) || null;
  try {
    await deleteInvoiceInPostgres(cleanUser, invoiceId);
  } catch (e: any) {
    console.warn("Postgres invoice delete notice:", e?.message);
  }

  try {
    deleteInvoice(cleanUser, invoiceId);
    broadcastSyncEvent(cleanUser, 'INVOICE_DELETED', senderId);
    res.json({ success: true, message: "Invoice deleted from database" });
  } catch (err: any) {
    console.error("Invoice delete error:", err);
    res.status(500).json({ success: false, message: err?.message || "Delete failed" });
  }
});

// 8b. Clear All Sales / Invoices History API
app.post("/api/db/invoices/clear", async (req, res) => {
  const { username } = req.body;
  const cleanUser = String(username || '').toLowerCase().trim();
  const senderId = (req.headers['x-client-id'] as string) || req.body?.clientId || null;

  try {
    await clearInvoicesInPostgres(cleanUser);
  } catch (e: any) {
    console.warn("Postgres clear invoices notice:", e?.message);
  }

  try {
    const result = clearInvoiceHistory(cleanUser);
    broadcastSyncEvent(cleanUser, 'INVOICE_DELETED', senderId);
    res.json(result);
  } catch (err: any) {
    console.error("Clear invoices error:", err);
    res.status(500).json({ success: false, message: err?.message || "Failed to clear sales history" });
  }
});

// 9. Direct Debt Transaction Delete API
app.delete("/api/db/debt/:username/:transactionId", async (req, res) => {
  const { username, transactionId } = req.params;
  const cleanUser = String(username).toLowerCase().trim();
  const senderId = (req.headers['x-client-id'] as string) || (req.query.clientId as string) || null;

  try {
    await deleteDebtInPostgres(cleanUser, transactionId);
  } catch (e: any) {
    console.warn("Postgres debt delete notice:", e?.message);
  }

  try {
    deleteDebtTransaction(cleanUser, transactionId);
    broadcastSyncEvent(cleanUser, 'DEBT_DELETED', senderId);
    res.json({ success: true, message: "Debt transaction deleted from database" });
  } catch (err: any) {
    console.error("Debt transaction delete error:", err);
    res.status(500).json({ success: false, message: err?.message || "Delete failed" });
  }
});

// 9b. Clear Specific Customer Debt Transactions History API
app.post("/api/db/customer/:username/:customerId/clear-debts", async (req, res) => {
  const { username, customerId } = req.params;
  const cleanUser = String(username || '').toLowerCase().trim();
  const senderId = (req.headers['x-client-id'] as string) || req.body?.clientId || null;

  try {
    await clearCustomerDebtsInPostgres(cleanUser, customerId);
  } catch (e: any) {
    console.warn("Postgres clear customer debts notice:", e?.message);
  }

  try {
    const result = clearCustomerDebtHistory(cleanUser, customerId);
    broadcastSyncEvent(cleanUser, 'DEBT_DELETED', senderId);
    res.json(result);
  } catch (err: any) {
    console.error("Clear customer debts error:", err);
    res.status(500).json({ success: false, message: err?.message || "Failed to clear customer debt history" });
  }
});

// 10. Database Status API (Reports live PostgreSQL Supabase health & row counts)
app.get("/api/db/status", async (_req, res) => {
  try {
    const pgStatus = await getPostgresStatus();
    if (pgStatus.connected) {
      return res.json(pgStatus);
    }
    const localStatus = getLocalDatabaseStatus();
    res.json({ ...localStatus, postgresNotice: pgStatus.error });
  } catch (err: any) {
    const localStatus = getLocalDatabaseStatus();
    res.json(localStatus);
  }
});

// 11. Company Login API (Authenticated against PostgreSQL)
app.post("/api/db/login", async (req, res) => {
  const { username, passcode } = req.body;
  if (!username || !passcode) {
    return res.status(400).json({ success: false, message: "Username and password required." });
  }

  try {
    const pgLogin = await loginPostgresCompany(username, passcode);
    if (pgLogin.success) {
      try { loginLocalCompany(username, passcode); } catch {}
      return res.json(pgLogin);
    }
    return res.status(401).json(pgLogin);
  } catch (err: any) {
    console.warn("Postgres login fallback to local cache:", err.message);
    try {
      const result = loginLocalCompany(username, passcode);
      if (!result.success) {
        return res.status(401).json(result);
      }
      res.json(result);
    } catch (localErr: any) {
      res.status(500).json({ success: false, message: localErr?.message || "Login failed." });
    }
  }
});

// 12. Load Store State API (Fetches real-time state from PostgreSQL)
app.get("/api/db/load/:username", async (req, res) => {
  const cleanUser = String(req.params.username).toLowerCase().trim();
  try {
    const storeData = await getStoreDataFromPostgres(cleanUser);
    res.json({ success: true, data: storeData });
  } catch (err: any) {
    console.warn("Postgres load fallback to local store:", err.message);
    try {
      const storeData = getStoreDataForCompany(cleanUser);
      res.json({ success: true, data: storeData });
    } catch (localErr: any) {
      res.status(500).json({ success: false, message: localErr?.message || "Failed to load state." });
    }
  }
});

// 13. Synchronize Store State API (Persists to PostgreSQL & broadcasts)
app.post("/api/db/sync", async (req, res) => {
  const { username, payload } = req.body;
  if (!username || !payload) {
    return res.status(400).json({ success: false, message: "Username and payload required." });
  }

  const cleanUser = String(username).toLowerCase().trim();
  const senderId = (req.headers['x-client-id'] as string) || req.body?.clientId || null;

  try {
    await syncStoreDataToPostgres(cleanUser, payload);
    try { syncStoreDataForCompany(cleanUser, payload); } catch {}
    broadcastSyncEvent(cleanUser, 'SYNC_UPDATE', senderId);
    res.json({ success: true, message: "Synchronized with PostgreSQL database." });
  } catch (err: any) {
    console.warn("Postgres sync fallback to local store:", err.message);
    try {
      const result = syncStoreDataForCompany(cleanUser, payload);
      broadcastSyncEvent(cleanUser, 'SYNC_UPDATE', senderId);
      res.json(result);
    } catch (localErr: any) {
      res.status(500).json({ success: false, message: localErr?.message || "Failed to sync to database." });
    }
  }
});

// 14. Clear Database Data API
app.post("/api/db/clear", (req, res) => {
  const { username } = req.body;
  const cleanUser = username ? String(username).toLowerCase().trim() : null;

  try {
    clearStoreData(cleanUser);
    broadcastSyncEvent(cleanUser || 'all', 'STORE_CLEARED');
    res.json({ success: true, message: "Local database records cleared successfully." });
  } catch (err: any) {
    console.error("Clear database error:", err);
    res.status(500).json({ success: false, message: err?.message || "Failed to clear database." });
  }
});

// 15. Backup Management APIs (Automatic & Manual Snapshots)
// 15a. List all backups
app.get("/api/db/backups", (_req, res) => {
  try {
    const list = listDatabaseBackups();
    res.json({ success: true, backups: list });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Failed to list backups" });
  }
});

// 15b. Create backup snapshot
app.post("/api/db/backups/create", (req, res) => {
  try {
    const label = req.body?.label ? String(req.body.label).trim() : 'Manual Backup';
    const backup = createDatabaseBackup(label);
    broadcastSyncEvent('all', 'BACKUP_CREATED');
    res.json({ success: true, message: "Nuqulka waxaa loo keydiyay si guul leh.", backup });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Failed to create backup" });
  }
});

// 15c. Restore from backup snapshot
app.post("/api/db/backups/restore", (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ success: false, message: "Filename is required" });
  }

  try {
    const result = restoreDatabaseFromBackup(filename);
    if (!result.success) {
      return res.status(400).json(result);
    }
    // Broadcast database restore to all connected cashier screens & phones
    broadcastSyncEvent('all', 'SYNC_UPDATE');
    broadcastSyncEvent('all', 'RESTORE_COMPLETED');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Failed to restore backup" });
  }
});

// 15d. Delete backup snapshot
app.delete("/api/db/backups/:filename", (req, res) => {
  const filename = req.params.filename;
  try {
    const success = deleteDatabaseBackup(filename);
    res.json({ success, message: success ? "Nuqulka waa la tirtiray." : "Nuqulkan lama helin." });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Failed to delete backup" });
  }
});

// 15e. Direct download backup file for USB flash drive storage
app.get("/api/db/backups/download/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = getBackupFilePath(filename);
  if (!filePath) {
    return res.status(404).json({ success: false, message: "Backup file not found" });
  }
  res.download(filePath, filename);
});

// Explicit JSON 404 handler for all unmatched /api/* endpoints
// This strictly prevents API requests from falling through to Vite SPA index.html
app.all("/api/*", (_req, res) => {
  res.status(404).json({ 
    success: false, 
    message: "Endpoint-ka lama helin (API endpoint not found)." 
  });
});

// Global Express error handler for API routes
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error("Unhandled API error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Server-ka gudahiisa ayaa khalad ka dhacay."
  });
});

let serverInitPromise: Promise<void> | null = null;

export async function ensureServerInitialized(): Promise<void> {
  if (!serverInitPromise) {
    serverInitPromise = (async () => {
      initLocalDatabase();
      try {
        await Promise.race([
          initPostgresTables(),
          new Promise((resolve) => setTimeout(resolve, 4000))
        ]);
      } catch (err: any) {
        console.warn("PostgreSQL init notice:", err?.message || err);
      }
    })();
  }
  await serverInitPromise;
}

async function startServer() {
  // 1. Initialize local disk database cache immediately (sync and instant)
  initLocalDatabase();

  // 2. Mount Vite dev middleware (async) or production static files
  if (process.env.NODE_ENV !== "production") {
    const viteReadyPromise = import("vite").then(({ createServer: createViteServer }) =>
      createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      })
    );

    app.use(async (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        return next();
      }
      try {
        const vite = await viteReadyPromise;
        return vite.middlewares(req, res, next);
      } catch (err) {
        return next(err);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        return next();
      }
      const indexFile = path.join(distPath, "index.html");
      if (fs.existsSync(indexFile)) {
        return res.sendFile(indexFile);
      }
      return res.status(404).json({ success: false, message: "Application build not found." });
    });
  }

  // 3. Start listening immediately so proxy/nginx never returns 502/warmup/page not found
  app.listen(PORT, "0.0.0.0", () => {
    const netInfo = getLocalNetworkInfo(PORT);
    console.log("========================================================================");
    console.log("🚀 BULAALE POS - LOCAL OFFLINE SERVER RUNNING");
    console.log("========================================================================");
    console.log(`💻 Cashier PC (Local):     ${netInfo.localhostUrl}`);
    if (netInfo.devices.length > 0) {
      netInfo.devices.forEach(d => {
        console.log(`📱 Mobile Devices (${d.type}): ${d.url}`);
      });
    } else {
      console.log(`📱 Mobile Hotspot: Connect phones to PC Wi-Fi Hotspot on port ${PORT}`);
    }
    console.log("💾 Local Storage:         ./data/pos_database.json (100% Offline)");
    console.log("🛡️ Automated Backups:     ./data/backups/ (Active)");
    console.log("⚡ Multi-Device Live Sync: Server-Sent Events (SSE) Active");
    console.log("========================================================================");
  });

  // 4. Background non-blocking verification of PostgreSQL Supabase tables
  initPostgresTables()
    .then((pgSuccess) => {
      if (pgSuccess) {
        console.log("🐘 PostgreSQL Supabase Database: Connected and verified tables.");
      }
    })
    .catch((err: any) => {
      console.warn("PostgreSQL background connection notice:", err?.message || err);
    });

  // 5. Create initial automated baseline backup in the background
  try {
    const existing = listDatabaseBackups();
    if (existing.length === 0) {
      createDatabaseBackup('Initial_System_Baseline');
    }
  } catch (e) {
    console.warn("Baseline backup notice:", e);
  }

  // 6. Periodic automated rolling backup every 4 hours
  setInterval(() => {
    try {
      createDatabaseBackup('Auto_Scheduled_4hr');
      console.log('[Auto-Backup] Periodic database snapshot saved to disk.');
    } catch (e) {
      console.warn('[Auto-Backup] Notice:', e);
    }
  }, 4 * 60 * 60 * 1000);
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;


