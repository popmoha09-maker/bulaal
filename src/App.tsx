/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, Product, InventoryItem, Invoice, Shift, AuditLog, 
  SyncQueueItem, Warehouse, Customer, DebtTransaction, ScannerMode, PaymentMethod
} from './types';
import { 
  INITIAL_PRODUCTS, INITIAL_INVENTORY, INITIAL_USERS, 
  INITIAL_SHIFTS, INITIAL_INVOICES, INITIAL_AUDIT_LOGS,
  INITIAL_CUSTOMERS, INITIAL_DEBT_TRANSACTIONS
} from './initialData';

// Supabase Real PostgreSQL Database Handlers
import { 
  loginCompanyFromSupabase,
  syncCompanyToSupabase,
  loadCompanyFromSupabase,
  createProductInDatabase,
  executeSaleInDatabase,
  lookupProductFromDatabase
} from './lib/supabaseDb';

// Modular views
import { POSTerminal } from './components/POSTerminal';
import { InventoryManager } from './components/InventoryManager';
import { InvoiceList } from './components/InvoiceList';
import { FinancialDashboard } from './components/FinancialDashboard';
import { CashierSettings } from './components/CashierSettings';
import { CustomersDebtsManager } from './components/CustomersDebtsManager';
import { CustomerReceiptView } from './components/CustomerReceiptView';
import { LocalHotspotModal } from './components/LocalHotspotModal';
import { resolveProductFromCode, playScanBeep } from './lib/barcodeScanner';

// Icons
import { 
  Calculator, Boxes, Receipt, 
  BarChart3, Settings, Key, Lock,
  Building2, LogOut, CheckCircle2, Users, Sun, Moon,
  ShoppingCart, RefreshCw, Smartphone, QrCode, Wifi
} from 'lucide-react';

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  // Public Customer Electronic Receipt View (When customer scans receipt QR code)
  const publicReceiptInfo = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const receiptNum = params.get('receipt');
    if (!receiptNum) return null;
    return {
      receiptNumber: receiptNum,
      encodedData: params.get('d')
    };
  }, []);

  if (publicReceiptInfo) {
    return (
      <CustomerReceiptView
        receiptNumber={publicReceiptInfo.receiptNumber}
        encodedData={publicReceiptInfo.encodedData}
        onExit={() => {
          window.location.href = window.location.origin;
        }}
      />
    );
  }
  // One-time purge of legacy mock data / dates from local storage so client is completely clean
  if (typeof window !== 'undefined' && !localStorage.getItem('sre_v5_wipe_complete')) {
    const staleKeys = [
      'sre_v4_products', 'sre_v4_inventory', 'sre_v4_customers', 
      'sre_v4_debt_transactions', 'sre_v4_invoices', 'sre_v4_shifts', 
      'sre_v4_audit_logs', 'sre_v4_sync_queue'
    ];
    staleKeys.forEach(k => localStorage.removeItem(k));
    localStorage.setItem('sre_v5_wipe_complete', 'true');
  }

  // Theme state: dark by default for professional POS look
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('sre_v4_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  // Active Supabase Logged-In Username State
  const [activeCompanyUsername, setActiveCompanyUsername] = useState<string | null>(() => {
    return localStorage.getItem('sre_supabase_active_username') || localStorage.getItem('sre_firebase_active_username') || null;
  });

  // Active Session Token for Secure Login
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return localStorage.getItem('sre_supabase_session_token') || localStorage.getItem('sre_firebase_session_token') || null;
  });

  // One-Time Login (Stay Signed In) choice
  const [staySignedIn, setStaySignedIn] = useState<boolean>(true);

  // Login Gatekeeper modal state
  const [isIntroOpen, setIsIntroOpen] = useState<boolean>(() => {
    const active = localStorage.getItem('sre_supabase_active_username') || localStorage.getItem('sre_firebase_active_username');
    const token = localStorage.getItem('sre_supabase_session_token') || localStorage.getItem('sre_firebase_session_token');
    return !(active && token);
  });

  // Login Form States (Username & Password)
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPasscode, setLoginPasscode] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loginErrorMessage, setLoginErrorMessage] = useState<string | null>(null);

  // Global Scanner Mode: 'in' = Stock Entry, 'out' = Sales / Stock Out
  const [scannerMode, setScannerMode] = useState<ScannerMode>('out');
  const [stockInTargetBarcode, setStockInTargetBarcode] = useState<string | null>(null);

  // Local Wi-Fi Hotspot Modal state
  const [isHotspotModalOpen, setIsHotspotModalOpen] = useState(false);

  // Store Enterprise Profile
  const [enterprise, setEnterprise] = useState<{
    companyName?: string;
    companyLocation?: string;
    warehouseName?: string;
    companyCode?: string;
    phone?: string;
  }>(() => {
    return safeJsonParse(localStorage.getItem('sre_v4_enterprise'), {
      companyName: 'BULAALE MINI MARKET',
      companyLocation: 'Main Branch',
      warehouseName: 'Central Warehouse',
      companyCode: 'BULAALE'
    });
  });

  // Warehouses state
  const [warehouses, setWarehouses] = useState<Warehouse[]>(() => {
    return safeJsonParse(localStorage.getItem('sre_v4_warehouses'), [
      { id: 'w_1', name: 'Central Warehouse', location: 'Main Hub' }
    ]);
  });

  useEffect(() => {
    localStorage.setItem('sre_v4_warehouses', JSON.stringify(warehouses));
  }, [warehouses]);

  // Products state
  const [products, setProducts] = useState<Product[]>(() => {
    const parsed = safeJsonParse<Product[] | null>(localStorage.getItem('sre_v4_products'), null);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return INITIAL_PRODUCTS;
  });

  // Inventory state
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const parsed = safeJsonParse<InventoryItem[] | null>(localStorage.getItem('sre_v4_inventory'), null);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return INITIAL_INVENTORY;
  });

  // Single Owner Account state
  const [users, setUsers] = useState<User[]>(() => {
    return safeJsonParse(localStorage.getItem('sre_v4_users'), INITIAL_USERS);
  });

  useEffect(() => {
    localStorage.setItem('sre_v4_users', JSON.stringify(users));
  }, [users]);
  
  const [currentUser, setCurrentUser] = useState<User>(() => {
    return INITIAL_USERS[0];
  });

  const [shifts, setShifts] = useState<Shift[]>(() => {
    return safeJsonParse(localStorage.getItem('sre_v4_shifts'), INITIAL_SHIFTS);
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    return safeJsonParse(localStorage.getItem('sre_v4_invoices'), INITIAL_INVOICES);
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    return safeJsonParse(localStorage.getItem('sre_v4_audit_logs'), INITIAL_AUDIT_LOGS);
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    return safeJsonParse(localStorage.getItem('sre_v4_customers'), INITIAL_CUSTOMERS);
  });

  useEffect(() => {
    localStorage.setItem('sre_v4_customers', JSON.stringify(customers));
  }, [customers]);

  const [debtTransactions, setDebtTransactions] = useState<DebtTransaction[]>(() => {
    return safeJsonParse(localStorage.getItem('sre_v4_debt_transactions'), INITIAL_DEBT_TRANSACTIONS);
  });

  useEffect(() => {
    localStorage.setItem('sre_v4_debt_transactions', JSON.stringify(debtTransactions));
  }, [debtTransactions]);

  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>(() => {
    return safeJsonParse(localStorage.getItem('sre_v4_sync_queue'), []);
  });

  // Navigation and Layout states
  const [isOffline, setIsOffline] = useState(false);
  const [isEncryptedCost, setIsEncryptedCost] = useState(false);
  const [activeTab, setActiveTab] = useState<'pos' | 'inventory' | 'sales' | 'charts' | 'debts' | 'settings'>('pos');
  const [isSyncingLoader, setIsSyncingLoader] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Global Notification Toast
  const [globalToast, setGlobalToast] = useState<{ message: string; type: 'info' | 'success' | 'warning' } | null>(null);
  const showGlobalToast = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setGlobalToast({ message, type });
    setTimeout(() => setGlobalToast(null), 3500);
  };

  // Sound beep on scan
  const triggerScanAudioBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
  };

  // Toggle Scanner Mode (IN vs OUT)
  const handleToggleScannerMode = () => {
    const nextMode = scannerMode === 'out' ? 'in' : 'out';
    setScannerMode(nextMode);
    triggerScanAudioBeep();
    showGlobalToast(
      nextMode === 'in'
        ? 'Waxaa loo wareegay: [ IN MODE ] Soo Galinta Alaabta (Stock Entry)'
        : 'Waxaa loo wareegay: [ OUT MODE ] Iibka & Bixinta (Sales / Stock Out)',
      'info'
    );
  };

  // Lifted Shopping Cart state for instant scanner response and tab persistence
  const [cart, setCart] = useState<{ product: Product; quantity: number; discountPercent: number }[]>(() => {
    return safeJsonParse(localStorage.getItem('sre_v4_cart'), []);
  });

  useEffect(() => {
    localStorage.setItem('sre_v4_cart', JSON.stringify(cart));
  }, [cart]);

  const handleAddToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1, discountPercent: 0 }];
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const handleUpdateDiscount = (productId: string, discount: number) => {
    const sanitized = Math.min(100, Math.max(0, discount));
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, discountPercent: sanitized } : item
      )
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Hardware Scanner Listener (USB / Bluetooth HID Keyboard Wedge)
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow F2 key to toggle Scanner Mode globally from any screen
      if (e.key === 'F2') {
        e.preventDefault();
        handleToggleScannerMode();
        return;
      }

      // Check if user is actively typing inside an input, textarea, or contentEditable
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      );

      // If user is typing in any form or search input, NEVER intercept, drop, or erase keys
      if (isInputFocused) {
        barcodeBuffer = '';
        return;
      }

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // Scanners send keystrokes with extreme speed (< 60ms between characters)
      // If typing is manual/slow (> 150ms between keys), reset buffer
      if (timeDiff > 150) {
        barcodeBuffer = '';
      }

      if (e.key === 'Enter') {
        if (barcodeBuffer.trim().length >= 2) {
          e.preventDefault();
          e.stopPropagation();
          const rawCode = barcodeBuffer.trim();
          barcodeBuffer = '';
          handleProcessScannedCode(rawCode);
          return;
        }
        barcodeBuffer = '';
        return;
      }

      // Buffer single printable characters when outside of any input element
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, scannerMode, cart]);

  const tabClientIdRef = useRef<string>(
    typeof window !== 'undefined'
      ? (window.sessionStorage.getItem('pos_client_id') || (() => {
          const id = 'client_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
          window.sessionStorage.setItem('pos_client_id', id);
          return id;
        })())
      : 'client_' + Date.now()
  );

  const [smartRegisterBarcode, setSmartRegisterBarcode] = useState<string | null>(null);

  // Global Scanned Code Handler: Truly Intelligent Scanner Workflow
  const handleProcessScannedCode = async (scannedCode: string) => {
    const { product: foundProduct, cleanCode } = resolveProductFromCode(scannedCode, products);

    if (foundProduct) {
      // CASE 1: PRODUCT ALREADY EXISTS
      // Check stock
      const stock = inventory.find(inv => inv.productId === foundProduct.id)?.quantityOnHand ?? 0;
      const inCart = cart.find(it => it.product.id === foundProduct.id)?.quantity ?? 0;
      if (stock > 0 && inCart + 1 > stock) {
        showGlobalToast(`Digniin: Kaydka waxaa ku haray kaliya ${stock} xabbo!`, 'warning');
      }
      handleAddToCart(foundProduct);
      playScanBeep('success');
      setActiveTab('pos');
      showGlobalToast(`✓ ${foundProduct.name} - $${foundProduct.retailPrice.toFixed(2)} (Kayd: ${stock})`, 'success');
    } else {
      // Check real database first before opening registration modal
      try {
        const dbRes = await lookupProductFromDatabase(activeCompanyUsername || 'bulaale', cleanCode || scannedCode);
        if (dbRes.found && dbRes.product) {
          handleAddToCart(dbRes.product);
          playScanBeep('success');
          setActiveTab('pos');
          showGlobalToast(`✓ ${dbRes.product.name} - $${dbRes.product.retailPrice.toFixed(2)} (Kayd: ${dbRes.stock})`, 'success');
          return;
        }
      } catch {}

      // CASE 2: PRODUCT DOES NOT EXIST -> Automatically open New Product Registration
      playScanBeep('warn');
      setActiveTab('pos');
      setSmartRegisterBarcode(cleanCode || scannedCode);
      showGlobalToast(`Alaabta koodhkan (${cleanCode || scannedCode}) lama helin. Fadlan buuxi xogta si toos loogu daro kashyarka.`, 'info');
    }
  };

  // Central Shared Supabase PostgreSQL Cloud DB states
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [lastCloudSyncTime, setLastCloudSyncTime] = useState<string | null>(null);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const lastSyncedPayloadRef = useRef<string>('');
  const isIncomingRemoteUpdateRef = useRef<boolean>(false);

  // Sync state to Supabase PostgreSQL database
  const triggerCloudSync = async (forceData?: {
    enterprise?: any;
    warehouses?: any[];
    products?: any[];
    inventory?: any[];
    users?: any[];
    shifts?: any[];
    invoices?: any[];
    auditLogs?: any[];
    customers?: any[];
    debtTransactions?: any[];
  }) => {
    const targetUsername = activeCompanyUsername;
    if (!targetUsername || isOffline) return;
    
    const payload = {
      enterprise: forceData?.enterprise || enterprise || {
        companyName: 'BULAALE MINI MARKET',
        companyLocation: 'Main Branch',
        warehouseName: 'Central Warehouse',
        companyCode: targetUsername.toUpperCase(),
        regDate: new Date().toISOString()
      },
      warehouses: forceData?.warehouses || warehouses,
      products: forceData?.products || products,
      inventory: forceData?.inventory || inventory,
      users: forceData?.users || users,
      shifts: forceData?.shifts || shifts,
      invoices: forceData?.invoices || invoices,
      auditLogs: forceData?.auditLogs || auditLogs,
      customers: forceData?.customers || customers,
      debtTransactions: forceData?.debtTransactions || debtTransactions,
    };

    const serialized = JSON.stringify(payload);
    if (serialized === lastSyncedPayloadRef.current) {
      return;
    }

    setIsCloudSyncing(true);
    setCloudSyncError(null);
    try {
      const res = await syncCompanyToSupabase(targetUsername, payload, tabClientIdRef.current);
      if (res && res.success) {
        lastSyncedPayloadRef.current = serialized;
        setLastCloudSyncTime(new Date().toLocaleTimeString());
      } else if (res && res.message) {
        setCloudSyncError(res.message);
      }
    } catch (err: any) {
      console.warn('Supabase sync notice:', err);
      setCloudSyncError(err?.message || 'Sync failed.');
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Real-Time Local Database Fetch, SSE Broadcast Listener & Polling for Multi-Device Live Sync
  useEffect(() => {
    if (!activeCompanyUsername || !sessionToken) return;

    let isMounted = true;
    let eventSource: EventSource | null = null;

    const applyRemoteData = (cloudState: any) => {
      if (!cloudState) return;
      const serialized = JSON.stringify({
        enterprise: cloudState.enterprise,
        warehouses: cloudState.warehouses,
        products: cloudState.products,
        inventory: cloudState.inventory,
        users: cloudState.users,
        shifts: cloudState.shifts,
        invoices: cloudState.invoices,
        auditLogs: cloudState.auditLogs,
        customers: cloudState.customers,
        debtTransactions: cloudState.debtTransactions
      });

      if (serialized === lastSyncedPayloadRef.current) {
        return;
      }

      isIncomingRemoteUpdateRef.current = true;
      lastSyncedPayloadRef.current = serialized;

      if (cloudState.products && Array.isArray(cloudState.products)) setProducts(cloudState.products);
      if (cloudState.inventory && Array.isArray(cloudState.inventory)) setInventory(cloudState.inventory);
      if (cloudState.warehouses && Array.isArray(cloudState.warehouses)) setWarehouses(cloudState.warehouses);
      if (cloudState.invoices && Array.isArray(cloudState.invoices)) setInvoices(cloudState.invoices);
      if (cloudState.auditLogs && Array.isArray(cloudState.auditLogs)) setAuditLogs(cloudState.auditLogs);
      if (cloudState.customers && Array.isArray(cloudState.customers)) setCustomers(cloudState.customers);
      if (cloudState.debtTransactions && Array.isArray(cloudState.debtTransactions)) setDebtTransactions(cloudState.debtTransactions);
      if (cloudState.enterprise) setEnterprise(cloudState.enterprise);
      setLastCloudSyncTime(new Date().toLocaleTimeString());
    };

    const fetchRemote = async () => {
      try {
        const remoteData = await loadCompanyFromSupabase(activeCompanyUsername);
        if (!isMounted) return;
        if (remoteData) {
          applyRemoteData(remoteData);
        }
      } catch (err) {
        console.warn('Sync poll notice:', err);
      }
    };

    fetchRemote();

    // 1. Instant Real-Time Multi-Device Sync over Wi-Fi Hotspot / Local Network via SSE
    try {
      eventSource = new EventSource(`/api/db/stream?username=${encodeURIComponent(activeCompanyUsername)}`);
      eventSource.onmessage = (event) => {
        try {
          const evt = JSON.parse(event.data);
          // CRITICAL: Ignore changes initiated by this client tab to prevent race condition overwriting local deletions
          if (evt.senderId && evt.senderId === tabClientIdRef.current) {
            return;
          }
          if (
            evt.type === 'SYNC_UPDATE' || 
            evt.type === 'PRODUCT_DELETED' || 
            evt.type === 'CUSTOMER_DELETED' || 
            evt.type === 'INVOICE_DELETED' || 
            evt.type === 'DEBT_DELETED' || 
            evt.type === 'STORE_CLEARED'
          ) {
            fetchRemote();
          }
        } catch {}
      };
    } catch (e) {
      console.warn('SSE stream notice:', e);
    }

    // 2. Background polling fallback every 8 seconds
    const pollInterval = setInterval(() => {
      if (!isOffline && !isIntroOpen) {
        fetchRemote();
      }
    }, 8000);

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(pollInterval);
    };
  }, [activeCompanyUsername, sessionToken, isOffline, isIntroOpen]);

  // Debounced Auto-Sync to Database when state changes locally
  useEffect(() => {
    if (!activeCompanyUsername || isOffline || isIntroOpen) return;

    if (isIncomingRemoteUpdateRef.current) {
      isIncomingRemoteUpdateRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      triggerCloudSync();
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    activeCompanyUsername, 
    isOffline, 
    isIntroOpen,
    products, 
    inventory, 
    warehouses, 
    users, 
    shifts, 
    invoices, 
    auditLogs, 
    customers, 
    debtTransactions, 
    enterprise
  ]);

  // Logout Handler
  const handleLogout = async () => {
    localStorage.removeItem('sre_supabase_active_username');
    localStorage.removeItem('sre_supabase_session_token');
    localStorage.removeItem('sre_firebase_active_username');
    localStorage.removeItem('sre_firebase_session_token');
    setActiveCompanyUsername(null);
    setSessionToken(null);
    setIsIntroOpen(true);
    showGlobalToast('Waad ka baxday nidaamka BULAALE', 'info');
  };

  // Sync theme to root
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('sre_v4_theme', theme);
  }, [theme]);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('sre_v4_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('sre_v4_inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('sre_v4_invoices', JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem('sre_v4_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);

  // Global KPIs (strictly NO VAT)
  const { globalTotalSales, globalTotalInvoices, globalTotalStockOnHand, globalTotalAssetValuation } = useMemo(() => {
    const activeInvs = invoices.filter(inv => inv.totalAmount > 0);
    const salesSum = activeInvs.reduce((acc, inv) => acc + inv.totalAmount, 0);
    const stockCount = inventory.reduce((acc, item) => acc + item.quantityOnHand, 0);
    const assetsSum = products.reduce((acc, p) => {
      const itemStock = inventory
        .filter(item => item.productId === p.id)
        .reduce((sum, item) => sum + item.quantityOnHand, 0);
      return acc + (itemStock * p.retailPrice);
    }, 0);

    return {
      globalTotalSales: salesSum,
      globalTotalInvoices: activeInvs.length,
      globalTotalStockOnHand: stockCount,
      globalTotalAssetValuation: assetsSum
    };
  }, [invoices, inventory, products]);

  // Add an audit log entry
  const addAuditLog = (action: string, details: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    const newLog: AuditLog = {
      id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      userId: currentUser.id,
      username: currentUser.username,
      action,
      details,
      type
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  // Direct Product Deletion Handler with backend and local synchronization
  const handleDeleteProduct = (productId: string) => {
    const prod = products.find(p => p.id === productId);
    const updatedProducts = products.filter((p) => p.id !== productId);
    const updatedInventory = inventory.filter((inv) => inv.productId !== productId);
    
    setProducts(updatedProducts);
    setInventory(updatedInventory);
    localStorage.setItem('sre_v4_products', JSON.stringify(updatedProducts));
    localStorage.setItem('sre_v4_inventory', JSON.stringify(updatedInventory));

    const activeUser = activeCompanyUsername || 'bulaale';
    fetch(`/api/db/product/${encodeURIComponent(activeUser)}/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      headers: { 'x-client-id': tabClientIdRef.current }
    }).catch((err) => console.warn('Product delete sync warning:', err));

    triggerCloudSync({ products: updatedProducts, inventory: updatedInventory });
    addAuditLog('Tirtiridda Alaabta', `Waxaa nidaamka laga tirtiray "${prod ? prod.name : productId}".`, 'warning');
    showGlobalToast('Alaabta waa la tirtiray', 'warning');
  };

  // Add Invoice Handler (Atomic transactional sale with database stock deduction)
  const handleAddInvoice = async (
    items: any[],
    paymentMethod: PaymentMethod,
    totalAmount: number,
    totalCost: number,
    customerId?: string,
    customerName?: string,
    isCreditSale?: boolean
  ): Promise<boolean> => {
    const generatedInvoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`;
    const activeUser = activeCompanyUsername || 'bulaale';

    const salePayload = {
      invoiceNumber: generatedInvoiceNumber,
      items,
      totalAmount,
      totalCost,
      paymentMethod,
      cashReceived: totalAmount,
      cashierName: currentUser.username,
      userId: currentUser.id,
      customerId,
      customerName,
      isCreditSale: Boolean(isCreditSale),
      shiftId: 'auto_shift'
    };

    try {
      const res = await executeSaleInDatabase(activeUser, salePayload, tabClientIdRef.current);
      if (!res.success || !res.invoice) {
        showGlobalToast(`Khalad Iibka: ${res.message || 'Iibka lama keydin karin database-ka.'}`, 'warning');
        return false;
      }

      const confirmedInvoice: Invoice = res.invoice;

      // Update invoices state with confirmed record
      setInvoices((prev) => [confirmedInvoice, ...prev.filter(i => i.id !== confirmedInvoice.id)]);

      // Update inventory directly from atomic database deductions
      if (res.updatedInventory && Array.isArray(res.updatedInventory)) {
        const invMap = new Map(res.updatedInventory.map(i => [i.productId, i.quantityOnHand]));
        setInventory((prev) => prev.map((invItem) => {
          if (invMap.has(invItem.productId)) {
            return {
              ...invItem,
              quantityOnHand: invMap.get(invItem.productId)!,
              lastRestockedAt: new Date().toISOString()
            };
          }
          return invItem;
        }));
      }

      // Update customer debt if credit sale
      if (isCreditSale && customerId && res.updatedCustomer) {
        setCustomers((prev) => prev.map(c => 
          c.id === customerId 
            ? { ...c, totalDebt: Number(res.updatedCustomer.totalDebt) || 0, updatedAt: new Date().toISOString() } 
            : c
        ));
      }

      addAuditLog(
        'Iib Cusub', 
        `Waxaa la fuliyay iibka #${generatedInvoiceNumber} oo ah $${totalAmount.toFixed(2)} (${isCreditSale ? 'Deyn: ' + customerName : 'Caddaan'})`, 
        'success'
      );

      return true;
    } catch (err: any) {
      console.error('Failed to complete sale transaction:', err);
      showGlobalToast(`Khalad: ${err?.message || 'Iibka ma uusan guuleysan'}`, 'warning');
      return false;
    }
  };

  // Add Debt Transaction Handler
  const handleAddDebtTransaction = (
    customerId: string, 
    amount: number, 
    notes: string, 
    invoiceNumber: string,
    itemName?: string,
    itemCategory?: string,
    itemQuantity?: number
  ) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;

    const newBalance = (customer.totalDebt || 0) + amount;
    const newTx: DebtTransaction = {
      id: `tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      customerId,
      customerName: customer.name,
      type: 'debt_incurred',
      amount,
      balanceAfter: newBalance,
      invoiceNumber,
      itemName: itemName || undefined,
      itemCategory: itemCategory || undefined,
      itemQuantity: itemQuantity || undefined,
      notes,
      timestamp: new Date().toISOString(),
      recordedBy: currentUser.username
    };

    const updatedDebts = [newTx, ...debtTransactions];
    const updatedCusts = customers.map(c => c.id === customerId ? { ...c, totalDebt: newBalance, updatedAt: new Date().toISOString() } : c);

    setDebtTransactions(updatedDebts);
    setCustomers(updatedCusts);
    triggerCloudSync({ customers: updatedCusts, debtTransactions: updatedDebts });
  };

  // Void Invoice Handler
  const handleVoidInvoice = (invoiceId: string) => {
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) return;

    // Restore inventory quantities
    setInventory((prev) => {
      const targetWh = warehouses[0]?.id || 'w_1';
      return prev.map((invItem) => {
        const itemToRestore = invoice.items.find((it) => it.productId === invItem.productId);
        if (
          itemToRestore &&
          (invItem.warehouse === targetWh ||
           invItem.warehouse === 'Central Warehouse' ||
           invItem.warehouse === warehouses[0]?.name ||
           !invItem.warehouse)
        ) {
          return {
            ...invItem,
            quantityOnHand: (Number(invItem.quantityOnHand) || 0) + itemToRestore.quantity,
            lastRestockedAt: new Date().toISOString()
          };
        }
        return invItem;
      });
    });

    // If it was a credit sale, reverse debt
    let updatedCusts = customers;
    let updatedDebts = debtTransactions;
    if (invoice.isCreditSale && invoice.customerId) {
      const cust = customers.find(c => c.id === invoice.customerId);
      if (cust) {
        const newBalance = Math.max(0, (cust.totalDebt || 0) - invoice.totalAmount);
        const reversalTx: DebtTransaction = {
          id: `tx_${Date.now()}_void`,
          customerId: cust.id,
          customerName: cust.name,
          type: 'payment_received',
          amount: invoice.totalAmount,
          balanceAfter: newBalance,
          invoiceNumber: invoice.invoiceNumber,
          notes: `Burrinta iibka ${invoice.invoiceNumber}`,
          timestamp: new Date().toISOString(),
          recordedBy: currentUser.username
        };
        updatedDebts = [reversalTx, ...debtTransactions];
        updatedCusts = customers.map(c => c.id === cust.id ? { ...c, totalDebt: newBalance } : c);
        setDebtTransactions(updatedDebts);
        setCustomers(updatedCusts);
        localStorage.setItem('sre_v4_debt_transactions', JSON.stringify(updatedDebts));
        localStorage.setItem('sre_v4_customers', JSON.stringify(updatedCusts));
      }
    }

    const remainingInvoices = invoices.filter((i) => i.id !== invoiceId);
    setInvoices(remainingInvoices);
    localStorage.setItem('sre_v4_invoices', JSON.stringify(remainingInvoices));

    const activeUser = activeCompanyUsername || 'bulaale';
    fetch(`/api/db/invoice/${encodeURIComponent(activeUser)}/${encodeURIComponent(invoiceId)}`, {
      method: 'DELETE',
      headers: { 'x-client-id': tabClientIdRef.current }
    }).catch(err => console.warn('Invoice delete sync warning:', err));

    triggerCloudSync({
      invoices: remainingInvoices,
      customers: updatedCusts,
      debtTransactions: updatedDebts
    });
    addAuditLog('Burrinta Iibka', `Waxaa la burriyay foomka #${invoice.invoiceNumber}. Alaabtii waxaa lagu celiyay kaydka.`, 'warning');
    showGlobalToast(`Foomka #${invoice.invoiceNumber} waa la burriyay`, 'info');
  };

  // Customer Management Handlers
  const handleAddCustomer = (
    customerData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>, 
    initialDebt: number = 0,
    initialDebtItemName?: string,
    initialDebtItemCategory?: string
  ) => {
    const newCustId = `cust_${Date.now()}`;
    const newCust: Customer = {
      ...customerData,
      id: newCustId,
      totalDebt: initialDebt,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updatedCusts = [newCust, ...customers];
    let updatedTx = debtTransactions;

    if (initialDebt > 0) {
      const initTx: DebtTransaction = {
        id: `tx_${Date.now()}_init`,
        customerId: newCustId,
        customerName: newCust.name,
        type: 'debt_incurred',
        amount: initialDebt,
        balanceAfter: initialDebt,
        itemName: initialDebtItemName || 'Deyn Hore (Alaab hore)',
        itemCategory: initialDebtItemCategory || 'Guud',
        itemQuantity: 1,
        notes: initialDebtItemName 
          ? `Deyn hore: ${initialDebtItemName} [Nuuca: ${initialDebtItemCategory || 'Guud'}]` 
          : 'Deyn hore oo lagu bilaabay xisaabta',
        timestamp: new Date().toISOString(),
        recordedBy: currentUser.username
      };
      updatedTx = [initTx, ...debtTransactions];
    }

    setCustomers(updatedCusts);
    setDebtTransactions(updatedTx);
    triggerCloudSync({ customers: updatedCusts, debtTransactions: updatedTx });
  };

  const handleUpdateCustomer = (id: string, updates: Partial<Customer>) => {
    const updated = customers.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c);
    setCustomers(updated);
    triggerCloudSync({ customers: updated });
  };

  const handleDeleteCustomer = (id: string) => {
    const cust = customers.find(c => c.id === id);
    if (!cust) return;
    const updatedCusts = customers.filter(c => c.id !== id);
    const updatedDebts = debtTransactions.filter(d => d.customerId !== id);

    setCustomers(updatedCusts);
    setDebtTransactions(updatedDebts);
    localStorage.setItem('sre_v4_customers', JSON.stringify(updatedCusts));
    localStorage.setItem('sre_v4_debt_transactions', JSON.stringify(updatedDebts));

    addAuditLog('Tirtiridda Macmiilka', `Waxaa la tirtiray macmiilka "${cust.name}".`, 'warning');
    showGlobalToast(`Macmiilka "${cust.name}" waa la tirtiray`, 'warning');
    
    // Direct delete from PostgreSQL database
    const activeUser = activeCompanyUsername || 'bulaale';
    fetch(`/api/db/customer/${encodeURIComponent(activeUser)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-client-id': tabClientIdRef.current }
    }).catch(err => console.warn('Customer delete sync warning:', err));

    triggerCloudSync({ customers: updatedCusts, debtTransactions: updatedDebts });
  };

  const handleDeleteDebtTransaction = (transactionId: string, customerId: string) => {
    const tx = debtTransactions.find(t => t.id === transactionId);
    if (!tx) return;

    const updatedDebts = debtTransactions.filter(t => t.id !== transactionId);

    // Calculate customer's exact remaining debt from all their remaining transactions
    const customerRemainingTxs = updatedDebts.filter(t => t.customerId === customerId);
    const totalIncurred = customerRemainingTxs
      .filter(t => t.type === 'debt_incurred')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const totalPaid = customerRemainingTxs
      .filter(t => t.type === 'payment_received')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const newTotalDebt = Math.max(0, totalIncurred - totalPaid);

    // Recalculate running balanceAfter for customer's remaining transactions in chronological order
    const sortedTxs = [...customerRemainingTxs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    let running = 0;
    const balanceMap = new Map<string, number>();
    sortedTxs.forEach(t => {
      if (t.type === 'debt_incurred') {
        running += (Number(t.amount) || 0);
      } else if (t.type === 'payment_received') {
        running = Math.max(0, running - (Number(t.amount) || 0));
      }
      balanceMap.set(t.id, running);
    });

    const finalUpdatedDebts = updatedDebts.map(t => {
      if (balanceMap.has(t.id)) {
        return { ...t, balanceAfter: balanceMap.get(t.id)! };
      }
      return t;
    });

    setDebtTransactions(finalUpdatedDebts);
    localStorage.setItem('sre_v4_debt_transactions', JSON.stringify(finalUpdatedDebts));

    const cust = customers.find(c => c.id === customerId);
    let updatedCusts = customers;
    if (cust) {
      updatedCusts = customers.map(c => 
        c.id === customerId 
          ? { ...c, totalDebt: newTotalDebt, updatedAt: new Date().toISOString() } 
          : c
      );
      setCustomers(updatedCusts);
      localStorage.setItem('sre_v4_customers', JSON.stringify(updatedCusts));
      addAuditLog(
        'Tirtiray Deyn Macmiil', 
        `Waxaa la tirtiray dhaqdhaqaaq deyn ah ($${(Number(tx.amount) || 0).toFixed(2)}) macmiilka "${cust.name}". Haraaga cusub: $${newTotalDebt.toFixed(2)}.`, 
        'warning'
      );
    }

    const activeUser = activeCompanyUsername || 'bulaale';
    fetch(`/api/db/debt/${encodeURIComponent(activeUser)}/${encodeURIComponent(transactionId)}`, {
      method: 'DELETE',
      headers: { 'x-client-id': tabClientIdRef.current }
    }).catch(err => console.warn('Debt transaction delete warning:', err));

    triggerCloudSync({ customers: updatedCusts, debtTransactions: finalUpdatedDebts });
    showGlobalToast(`Deynta waa la tirtiray. Haraaga macmiilka hadda: $${newTotalDebt.toFixed(2)}`, 'warning');
  };

  // Clear All Sales / Invoices History
  const handleClearInvoiceHistory = async () => {
    setInvoices([]);
    localStorage.setItem('sre_v4_invoices', JSON.stringify([]));

    const activeUser = activeCompanyUsername || 'bulaale';
    fetch('/api/db/invoices/clear', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-client-id': tabClientIdRef.current 
      },
      body: JSON.stringify({ username: activeUser })
    }).catch(err => console.warn('Clear invoices warning:', err));

    triggerCloudSync({ invoices: [] });
    addAuditLog('Tirtiray Taariikhda Iibka', 'Dhammaan taariikhdii foomamka iibka waa la tirtiray.', 'warning');
    showGlobalToast('Taariikhda dhammaan iibka waa la tirtiray si guul leh.', 'success');
  };

  // Clear Customer Debt Transactions History
  const handleClearCustomerDebts = async (customerId: string) => {
    const cust = customers.find(c => c.id === customerId);
    if (!cust) return;

    const remainingDebts = debtTransactions.filter(d => d.customerId !== customerId);
    setDebtTransactions(remainingDebts);
    localStorage.setItem('sre_v4_debt_transactions', JSON.stringify(remainingDebts));

    const updatedCusts = customers.map(c => c.id === customerId ? { ...c, totalDebt: 0, updatedAt: new Date().toISOString() } : c);
    setCustomers(updatedCusts);
    localStorage.setItem('sre_v4_customers', JSON.stringify(updatedCusts));

    const activeUser = activeCompanyUsername || 'bulaale';
    fetch(`/api/db/customer/${encodeURIComponent(activeUser)}/${encodeURIComponent(customerId)}/clear-debts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': tabClientIdRef.current
      }
    }).catch(err => console.warn('Clear customer debts warning:', err));

    triggerCloudSync({ customers: updatedCusts, debtTransactions: remainingDebts });
    addAuditLog(
      'Tirtiray Dhaqdhaqaaqyada Deynta',
      `Waxaa la tirtiray dhammaan dhaqdhaqaaqyadii deynta ee macmiilka "${cust.name}". Haraagu waa $0.00.`,
      'warning'
    );
    showGlobalToast(`Dhammaan dhaqdhaqaaqyada deynta ee macmiilka "${cust.name}" waa la tirtiray.`, 'success');
  };

  // Intelligent Scanner: Save Newly Registered Product and Automatically Add to POS Cart
  const handleRegisterProductAndAddToCart = async (
    productData: Product,
    initialStock: number = 10
  ): Promise<boolean> => {
    try {
      const activeUser = activeCompanyUsername || 'bulaale';
      const targetWh = warehouses[0]?.id || 'w_1';

      // 1. Save to Database first and wait for confirmed write
      const res = await createProductInDatabase(
        activeUser, 
        productData, 
        initialStock, 
        targetWh, 
        tabClientIdRef.current
      );

      if (!res.success || !res.product) {
        throw new Error(res.message || 'Lama keydin karin alaabta database-ka.');
      }

      const confirmedProduct: Product = {
        id: res.product.id,
        sku: res.product.sku,
        name: res.product.name,
        barcode: res.product.barcode,
        costPrice: Number(res.product.costPrice) || 0,
        retailPrice: Number(res.product.retailPrice) || 0,
        category: res.product.category,
        minStockLevel: Number(res.product.minStockLevel) || 5,
        description: res.product.description,
        imageUrl: res.product.imageUrl || '',
        color: res.product.color || '',
        size: res.product.size || '',
        qrCode: res.product.qrCode || '',
        isEncrypted: Boolean(res.product.isEncrypted)
      };

      const confirmedInventorySlot: InventoryItem = {
        id: res.inventory?.id || `inv_${Date.now()}`,
        productId: confirmedProduct.id,
        quantityOnHand: Number(res.inventory?.quantityOnHand) || initialStock,
        warehouse: res.inventory?.warehouse || warehouses[0]?.name || 'Central Warehouse',
        lastRestockedAt: new Date().toISOString()
      };

      // 2. Update local state with confirmed database records
      setProducts(prev => [confirmedProduct, ...prev.filter(p => p.id !== confirmedProduct.id)]);
      setInventory(prev => [confirmedInventorySlot, ...prev.filter(i => i.productId !== confirmedProduct.id)]);

      // 3. Add to cart with initial quantity 1
      handleAddToCart(confirmedProduct);

      addAuditLog(
        'Diiwaangelin & Iib Toos ah',
        `Alaab cusub "${confirmedProduct.name}" (#${confirmedProduct.barcode || confirmedProduct.sku}) ayaa la diiwaangeliyay database-ka oo toos loogu daray kashyarka. Kayd: ${confirmedInventorySlot.quantityOnHand}.`,
        'success'
      );

      return true;
    } catch (err: any) {
      console.error('Failed to register product and add to cart:', err);
      throw err;
    }
  };

  // Record Debt Payment (Gudista Deynta)
  const handleRecordDebtPayment = (customerId: string, amount: number, notes: string) => {
    const cust = customers.find(c => c.id === customerId);
    if (!cust) return;

    const newBalance = Math.max(0, (cust.totalDebt || 0) - amount);
    const newTx: DebtTransaction = {
      id: `tx_${Date.now()}_pay`,
      customerId,
      customerName: cust.name,
      type: 'payment_received',
      amount,
      balanceAfter: newBalance,
      notes: notes || 'Gudista deynta (Cash payment)',
      timestamp: new Date().toISOString(),
      recordedBy: currentUser.username
    };

    const updatedCusts = customers.map(c => c.id === customerId ? { ...c, totalDebt: newBalance, updatedAt: new Date().toISOString() } : c);
    const updatedTx = [newTx, ...debtTransactions];

    setCustomers(updatedCusts);
    setDebtTransactions(updatedTx);
    triggerCloudSync({ customers: updatedCusts, debtTransactions: updatedTx });
  };

  // Manual Debt Charge
  const handleAddManualDebt = (
    customerId: string, 
    amount: number, 
    notes: string,
    itemName?: string,
    itemCategory?: string,
    itemQuantity?: number
  ) => {
    const cust = customers.find(c => c.id === customerId);
    if (!cust) return;

    const newBalance = (cust.totalDebt || 0) + amount;
    const finalItemName = itemName || notes || 'Alaab deyn ah';
    const finalItemCategory = itemCategory || 'Guud';
    const finalItemQty = itemQuantity || 1;
    const structuredNote = notes || `${finalItemQty}x ${finalItemName} [Nuuca: ${finalItemCategory}]`;

    const newTx: DebtTransaction = {
      id: `tx_${Date.now()}_charge`,
      customerId,
      customerName: cust.name,
      type: 'debt_incurred',
      amount,
      balanceAfter: newBalance,
      itemName: finalItemName,
      itemCategory: finalItemCategory,
      itemQuantity: finalItemQty,
      notes: structuredNote,
      timestamp: new Date().toISOString(),
      recordedBy: currentUser.username
    };

    const updatedCusts = customers.map(c => c.id === customerId ? { ...c, totalDebt: newBalance, updatedAt: new Date().toISOString() } : c);
    const updatedTx = [newTx, ...debtTransactions];

    setCustomers(updatedCusts);
    setDebtTransactions(updatedTx);
    triggerCloudSync({ customers: updatedCusts, debtTransactions: updatedTx });
  };

  // Update Enterprise / Store Details & Receipt Header
  const handleUpdateEnterprise = (updated: any) => {
    setEnterprise(updated);
    localStorage.setItem('sre_v4_enterprise', JSON.stringify(updated));
    triggerCloudSync({ enterprise: updated });
    addAuditLog('Updated Store Profile', `Magaca: ${updated.companyName || ''}, Tel: ${updated.phone || ''}`, 'info');
  };

  // Reset Entire System to Zero
  const handleResetSystem = async () => {
    setProducts([]);
    setInventory([]);
    setCustomers([]);
    setDebtTransactions([]);
    setInvoices([]);
    setSyncQueue([]);
    setAuditLogs([]);

    localStorage.setItem('sre_v4_products', JSON.stringify([]));
    localStorage.setItem('sre_v4_inventory', JSON.stringify([]));
    localStorage.setItem('sre_v4_customers', JSON.stringify([]));
    localStorage.setItem('sre_v4_debt_transactions', JSON.stringify([]));
    localStorage.setItem('sre_v4_invoices', JSON.stringify([]));
    localStorage.setItem('sre_v4_audit_logs', JSON.stringify([]));

    try {
      await fetch('/api/db/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: activeCompanyUsername })
      });
    } catch (e) {
      console.warn('Clear database notice:', e);
    }

    showGlobalToast("Xogtii oo dhan si guul leh ayaa eber looga dhigay!", 'success');
  };

  return (
    <div className={`${theme === 'dark' ? 'dark' : ''} min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col antialiased select-none font-sans transition-colors duration-300`} dir="ltr">
      
      {/* 1. SIGN IN GATEKEEPER MODAL */}
      <AnimatePresence>
        {isIntroOpen && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-50 bg-slate-950/90 text-slate-100 flex items-center justify-center overflow-y-auto p-4 md:p-8"
            dir="ltr"
          >
            <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 relative overflow-hidden flex flex-col gap-5 text-slate-900 dark:text-slate-100">
              
              <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex items-center gap-3 text-left w-full">
                <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg select-none shrink-0 font-display shadow-sm">
                  B
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white font-display">
                    BULAALE MINI MARKET
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                    Nidaamka Iibka, Bakhaarka & Deymaha
                  </p>
                </div>
              </div>

              <div className="text-left">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-blue-600" />
                  <span>Soo Gelida Nidaamka (Sign In)</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Geli magaca dukaankaaga iyo lambarka sirta ah
                </p>
              </div>

              {loginErrorMessage && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                  <span className="font-bold">Khalad:</span>
                  <span>{loginErrorMessage}</span>
                </div>
              )}

              <form onSubmit={async (e) => {
                e.preventDefault();
                setLoginErrorMessage(null);
                if (!loginUsername.trim() || !loginPasscode.trim()) {
                  setLoginErrorMessage('Fadlan geli magaca iyo lambarka sirta ah.');
                  return;
                }
                setIsSyncingLoader(true);
                try {
                  const res = await loginCompanyFromSupabase(loginUsername, loginPasscode);
                  if (!res.success || !res.data) {
                    setLoginErrorMessage(res.message || 'Magaca ama lambarka sirta ah waa qalad.');
                    return;
                  }

                  const companyData = res.data;
                  const storeState = companyData.data || {};

                  if (storeState.products) setProducts(storeState.products);
                  if (storeState.inventory) setInventory(storeState.inventory);
                  if (storeState.warehouses) setWarehouses(storeState.warehouses);
                  if (storeState.invoices) setInvoices(storeState.invoices);
                  if (storeState.auditLogs) setAuditLogs(storeState.auditLogs);
                  if (storeState.customers) setCustomers(storeState.customers);
                  if (storeState.debtTransactions) setDebtTransactions(storeState.debtTransactions);
                  if (storeState.enterprise) setEnterprise(storeState.enterprise);

                  const cleanUser = companyData.username;
                  setActiveCompanyUsername(cleanUser);
                  localStorage.setItem('sre_supabase_active_username', cleanUser);

                  if (res.sessionToken) {
                    setSessionToken(res.sessionToken);
                    if (staySignedIn) {
                      localStorage.setItem('sre_supabase_session_token', res.sessionToken);
                    }
                  }

                  setIsIntroOpen(false);
                } catch (err: any) {
                  setLoginErrorMessage(`Notice: ${err?.message || 'Khalad ayaa dhacay markii la xiriirayay server-ka.'}`);
                } finally {
                  setIsSyncingLoader(false);
                }
              }} className="space-y-4 text-left" dir="ltr">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Magaca Isticmaalaha (Username)
                  </label>
                  <input 
                    type="text"
                    required
                    name="username"
                    autoComplete="username"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="tusaale: bulaale"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Furaha Sirta ah (Password)
                  </label>
                  <div className="relative">
                    <input 
                      type={showPin ? "text" : "password"}
                      required
                      name="password"
                      autoComplete="current-password"
                      value={loginPasscode}
                      onChange={(e) => setLoginPasscode(e.target.value)}
                      placeholder="Geli lambarka sirta ah"
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none transition-colors pr-14"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-3 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
                    >
                      {showPin ? "Qari" : "Muuji"}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input 
                    type="checkbox"
                    id="oneTimeLoginCheckbox"
                    checked={staySignedIn}
                    onChange={(e) => setStaySignedIn(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 cursor-pointer"
                  />
                  <label htmlFor="oneTimeLoginCheckbox" className="text-xs text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none">
                    I xusuuso (Stay signed in on this device)
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isSyncingLoader}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer flex items-center justify-center gap-2 mt-2 shadow-sm disabled:opacity-50"
                >
                  <Key className="w-4 h-4" />
                  <span>{isSyncingLoader ? 'Waa la xaqiijinayaa...' : 'Gal Nidaamka'}</span>
                </button>
              </form>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GLOBAL SCANNER NOTIFICATION TOAST */}
      {globalToast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl text-xs font-bold shadow-xl flex items-center gap-2 border transition-all ${
          globalToast.type === 'success'
            ? 'bg-emerald-600 text-white border-emerald-500'
            : globalToast.type === 'warning'
            ? 'bg-amber-600 text-white border-amber-500'
            : 'bg-blue-600 text-white border-blue-500'
        }`}>
          <span>{globalToast.message}</span>
        </div>
      )}

      {/* 2. MAIN APPLICATION PLATFORM */}
      {!isIntroOpen && (
        <div className="flex-1 flex overflow-hidden relative" dir="ltr">
        
        {/* COLLAPSIBLE DESKTOP/TABLET SIDEBAR */}
        <aside 
          className={`bg-slate-900 dark:bg-black border-r border-slate-200 dark:border-slate-800 hidden md:flex flex-col justify-between transition-all duration-200 shrink-0 select-none z-20 ${
            isSidebarCollapsed ? 'w-16' : 'w-64'
          }`}
          id="workspace-left-sidebar"
        >
          {/* Sidebar Brand Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white text-base select-none shrink-0 font-display">
                B
              </div>
              {!isSidebarCollapsed && (
                <div className="leading-tight text-left">
                  <h1 className="text-xs font-bold tracking-tight text-slate-100 uppercase font-display">
                    BULAALE MINI MARKET
                  </h1>
                  <p className="text-[10px] text-slate-400 font-sans">Nidaamka Iibka & Bakhaarka</p>
                </div>
              )}
            </div>

            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded hidden md:block cursor-pointer text-xs"
              title={isSidebarCollapsed ? "Balaari Menu-ga" : "Koob Menu-ga"}
            >
              ⊞
            </button>
          </div>

          {/* Sidebar Navigation Items in Somali */}
          <nav className="flex-1 px-3 py-3 space-y-1.5 overflow-y-auto">
            
            {/* POS */}
            <button
              onClick={() => setActiveTab('pos')}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'pos'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Calculator className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Iibka (POS)</span>}
            </button>

            {/* Inventory */}
            <button
              onClick={() => setActiveTab('inventory')}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Boxes className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Bakhaarka & Alaabta</span>}
            </button>

            {/* Debts & Customers */}
            <button
              onClick={() => setActiveTab('debts')}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'debts'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && (
                <div className="flex items-center justify-between w-full">
                  <span className="truncate">Macaamiisha & Deymaha</span>
                  {customers.filter((c) => (c.totalDebt || 0) > 0).length > 0 && (
                    <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.2 rounded-full font-bold ml-1">
                      {customers.filter((c) => (c.totalDebt || 0) > 0).length}
                    </span>
                  )}
                </div>
              )}
            </button>

            {/* Sales Invoices */}
            <button
              onClick={() => setActiveTab('sales')}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'sales'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Receipt className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Taariikhda Iibka</span>}
            </button>

            {/* Reports */}
            <button
              onClick={() => setActiveTab('charts')}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'charts'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Warbixinaha Maaliyadda</span>}
            </button>

            {/* Settings */}
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="truncate">Habeynta Nidaamka</span>}
            </button>

          </nav>

          {/* Sidebar Controls & Single Owner Info */}
          <div className="p-3 border-t border-slate-800 space-y-2">
            
            {/* Active Owner Profile */}
            <div className="bg-slate-950 border border-slate-850 p-2.5 rounded-xl flex items-center gap-2.5 text-left">
              <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              {!isSidebarCollapsed && (
                <div className="leading-tight truncate flex-1">
                  <span className="block font-bold text-slate-200 text-xs truncate">Mulkiilaha</span>
                  <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
                    Owner Account
                  </span>
                </div>
              )}
            </div>

            {/* Controller buttons */}
            <div className={`flex flex-col gap-1.5 ${isSidebarCollapsed ? 'items-center' : ''}`}>
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="w-full py-2 px-2.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    {!isSidebarCollapsed && <span>Iftiin</span>}
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    {!isSidebarCollapsed && <span>Mugdi</span>}
                  </>
                )}
              </button>

              <button
                onClick={handleLogout}
                className="w-full py-2 px-2.5 bg-red-950/20 hover:bg-red-900/30 text-red-400 border border-red-900/30 rounded-lg text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 text-red-400 shrink-0" />
                {!isSidebarCollapsed && <span>Ka Bax</span>}
              </button>
            </div>

          </div>
        </aside>

        {/* MAIN MODULE CONTENT AREA */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative" dir="ltr">
          
          {/* TOP GLOBAL HEADER BAR WITH SCANNER MODE & WI-FI HOTSPOT */}
          <header className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 py-2.5 flex items-center justify-between gap-3 shrink-0 transition-colors duration-200">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-bold font-display tracking-tight text-slate-900 dark:text-white">
                {enterprise?.companyName || 'BULAALE MINI MARKET'}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Offline Local Server
              </span>
            </div>

            {/* SCANNER MODE & WI-FI HOTSPOT CONTROLLERS */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsHotspotModalOpen(true)}
                className="px-2.5 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-850 transition-colors cursor-pointer"
                title="Ku xir taleefannada dukaanka (Wi-Fi Hotspot & QR Code)"
              >
                <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                <span className="hidden sm:inline">Wi-Fi Hotspot / Taleefannada</span>
                <span className="sm:hidden">Hotspot</span>
              </button>

              <button
                type="button"
                onClick={handleToggleScannerMode}
                className={`px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-2 transition-colors cursor-pointer border ${
                  scannerMode === 'in'
                    ? 'bg-slate-800 text-emerald-400 border-emerald-600/50 hover:bg-slate-750'
                    : 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500'
                }`}
                title="Guji ama riix F2 si aad u beddesho Habka Baaraha (Scanner Mode)"
              >
                {scannerMode === 'in' ? (
                  <>
                    <Boxes className="w-3.5 h-3.5 shrink-0" />
                    <span>IN (Soo Galinta)</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                    <span>OUT (Iibka)</span>
                  </>
                )}
                <span className="text-[10px] opacity-70 font-mono bg-black/30 px-1 py-0.2 rounded">F2</span>
              </button>
            </div>
          </header>

          {/* SYSTEM SYNC OVERLAY */}
          {isSyncingLoader && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl max-w-xs w-full text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Waa la xiriirinayaa...</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Xogta ayaa loo dirayaa server-ka dhexe.</p>
                </div>
              </div>
            </div>
          )}

          {/* MAIN CONTAINER PANEL */}
          <main className="flex-1 p-3 md:p-6 pb-20 md:pb-6 overflow-hidden relative bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -5 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                {activeTab === 'pos' && (
                  <POSTerminal
                    products={products}
                    currentUser={currentUser}
                    customers={customers}
                    cart={cart}
                    inventory={inventory}
                    onAddToCart={handleAddToCart}
                    onUpdateQuantity={handleUpdateQuantity}
                    onUpdateDiscount={handleUpdateDiscount}
                    onRemoveFromCart={handleRemoveFromCart}
                    onClearCart={handleClearCart}
                    onAddInvoice={handleAddInvoice}
                    onAddDebtTransaction={handleAddDebtTransaction}
                    onAddAuditLog={addAuditLog}
                    isOffline={isOffline}
                    onDeleteProduct={handleDeleteProduct}
                    enterprise={enterprise}
                    scannerMode={scannerMode}
                    onToggleScannerMode={handleToggleScannerMode}
                    onTriggerStockInModal={(productOrCode) => {
                      setActiveTab('inventory');
                      if (typeof productOrCode === 'string') {
                        setStockInTargetBarcode(productOrCode);
                      } else if (productOrCode && (productOrCode.barcode || productOrCode.sku)) {
                        setStockInTargetBarcode(productOrCode.barcode || productOrCode.sku);
                      }
                    }}
                    onRegisterProductAndAddToCart={handleRegisterProductAndAddToCart}
                    externalTriggerRegisterBarcode={smartRegisterBarcode}
                    onClearExternalTriggerBarcode={() => setSmartRegisterBarcode(null)}
                  />
                )}

                {activeTab === 'inventory' && (
                  <InventoryManager
                    products={products}
                    inventory={inventory}
                    currentUser={currentUser}
                    warehouses={warehouses}
                    initialStockInBarcode={stockInTargetBarcode}
                    onClearStockInBarcode={() => setStockInTargetBarcode(null)}
                    onBatchImportProducts={(newProds, newInvs, updatedProds, auditMsg) => {
                      let nextProds = [...products];
                      // 1. Apply updates to existing products
                      if (updatedProds.length > 0) {
                        const updatedMap = new Map(updatedProds.map(p => [p.id, p]));
                        nextProds = nextProds.map(p => updatedMap.get(p.id) || p);
                      }
                      // 2. Prepend new products
                      if (newProds.length > 0) {
                        nextProds = [...newProds, ...nextProds];
                      }
                      setProducts(nextProds);
                      localStorage.setItem('sre_v4_products', JSON.stringify(nextProds));

                      // 3. Update inventory
                      let nextInv = [...inventory];
                      if (newInvs.length > 0) {
                        const invMap = new Map(newInvs.map(i => [i.productId, i]));
                        const updatedExisting = nextInv.map(i => {
                          const matched = invMap.get(i.productId);
                          if (matched) {
                            invMap.delete(i.productId);
                            return { ...i, quantityOnHand: matched.quantityOnHand, lastRestockedAt: new Date().toISOString() };
                          }
                          return i;
                        });
                        const remainingNew = Array.from(invMap.values());
                        nextInv = [...remainingNew, ...updatedExisting];
                      }
                      setInventory(nextInv);
                      localStorage.setItem('sre_v4_inventory', JSON.stringify(nextInv));

                      // 4. Audit Log & Cloud Sync
                      addAuditLog('Soo Gelinta Excel (Gemini AI)', auditMsg, 'success');
                      triggerCloudSync({ products: nextProds, inventory: nextInv });
                    }}
                    onAddWarehouse={(name, location) => {
                      const newWhId = `w_${Date.now()}`;
                      const newWh = { id: newWhId, name, location };
                      setWarehouses((prev) => [...prev, newWh]);
                      addAuditLog('Bakhaar Cusub', `Waxaa la diiwaangeliyay bakhaarka cusub: ${name}`, 'success');
                    }}
                    onDeleteWarehouse={(warehouseId) => {
                      const whName = warehouses.find(w => w.id === warehouseId)?.name || 'Unknown';
                      setWarehouses((prev) => prev.filter((w) => w.id !== warehouseId));
                      addAuditLog('Tirtiridda Bakhaarka', `Waxaa la tirtiray bakhaarka "${whName}".`, 'warning');
                    }}
                    onUpdateInventory={(productId, warehouseId, qty) => {
                      const targetWh = warehouseId || warehouses[0]?.id || 'w_1';
                      const parsedQty = typeof qty === 'number' ? (isNaN(qty) ? 0 : qty) : (parseFloat(String(qty)) || 0);

                      setInventory((prev) => {
                        const existingIndex = prev.findIndex(
                          (item) =>
                            item.productId === productId &&
                            (item.warehouse === targetWh ||
                             item.warehouse === 'Central Warehouse' ||
                             item.warehouse === warehouses[0]?.name ||
                             !item.warehouse)
                        );

                        let nextInv: InventoryItem[];
                        if (existingIndex >= 0) {
                          nextInv = prev.map((item, idx) =>
                            idx === existingIndex
                              ? { ...item, warehouse: targetWh, quantityOnHand: parsedQty, lastRestockedAt: new Date().toISOString() }
                              : item
                          );
                        } else {
                          const anyIndex = prev.findIndex((item) => item.productId === productId);
                          if (anyIndex >= 0) {
                            nextInv = prev.map((item, idx) =>
                              idx === anyIndex
                                ? { ...item, warehouse: targetWh, quantityOnHand: parsedQty, lastRestockedAt: new Date().toISOString() }
                                : item
                            );
                          } else {
                            const newItem: InventoryItem = {
                              id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                              productId,
                              warehouse: targetWh,
                              quantityOnHand: parsedQty,
                              lastRestockedAt: new Date().toISOString()
                            };
                            nextInv = [...prev, newItem];
                          }
                        }
                        localStorage.setItem('sre_v4_inventory', JSON.stringify(nextInv));
                        triggerCloudSync({ inventory: nextInv });
                        return nextInv;
                      });
                    }}
                    onAddProduct={(newProd, initQty, selectedWarehouseId) => {
                      const targetWh = selectedWarehouseId || warehouses[0]?.id || 'w_1';
                      const parsedQty = typeof initQty === 'number' ? (isNaN(initQty) ? 0 : initQty) : (parseFloat(String(initQty)) || 0);

                      let nextProds: Product[] = [];
                      setProducts((prev) => {
                        nextProds = [newProd, ...prev.filter(p => p.id !== newProd.id)];
                        localStorage.setItem('sre_v4_products', JSON.stringify(nextProds));
                        return nextProds;
                      });

                      setInventory((prev) => {
                        const existingIndex = prev.findIndex(
                          (i) =>
                            i.productId === newProd.id &&
                            (i.warehouse === targetWh ||
                             i.warehouse === 'Central Warehouse' ||
                             i.warehouse === warehouses[0]?.name ||
                             !i.warehouse)
                        );

                        let nextInv: InventoryItem[];
                        if (existingIndex >= 0) {
                          nextInv = prev.map((item, idx) =>
                            idx === existingIndex
                              ? { ...item, warehouse: targetWh, quantityOnHand: parsedQty, lastRestockedAt: new Date().toISOString() }
                              : item
                          );
                        } else {
                          const anyIndex = prev.findIndex((item) => item.productId === newProd.id);
                          if (anyIndex >= 0) {
                            nextInv = prev.map((item, idx) =>
                              idx === anyIndex
                                ? { ...item, warehouse: targetWh, quantityOnHand: parsedQty, lastRestockedAt: new Date().toISOString() }
                                : item
                            );
                          } else {
                            const newItem: InventoryItem = {
                              id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                              productId: newProd.id,
                              warehouse: targetWh,
                              quantityOnHand: parsedQty,
                              lastRestockedAt: new Date().toISOString()
                            };
                            nextInv = [...prev, newItem];
                          }
                        }
                        localStorage.setItem('sre_v4_inventory', JSON.stringify(nextInv));
                        createProductInDatabase(activeCompanyUsername || 'bulaale', newProd, parsedQty, targetWh).catch(err => {
                          console.warn('DB product creation fallback error:', err);
                        });
                        triggerCloudSync({ products: nextProds.length > 0 ? nextProds : [newProd, ...products], inventory: nextInv });
                        return nextInv;
                      });
                    }}
                    onUpdateProductPrices={(productId, cost, retail, minStock, category, color, size, imageUrl, name, sku, barcode, qrCode, description) => {
                      setProducts((prev) => {
                        const nextProds = prev.map((p) =>
                          p.id === productId
                            ? { 
                                ...p, 
                                costPrice: cost, 
                                retailPrice: retail, 
                                minStockLevel: minStock,
                                ...(name ? { name } : {}),
                                ...(sku ? { sku } : {}),
                                ...(barcode !== undefined ? { barcode } : {}),
                                ...(qrCode !== undefined ? { qrCode } : {}),
                                ...(description !== undefined ? { description } : {}),
                                ...(category !== undefined ? { category } : {}),
                                ...(color !== undefined ? { color } : {}),
                                ...(size !== undefined ? { size } : {}),
                                ...(imageUrl !== undefined ? { imageUrl } : {})
                              }
                            : p
                        );
                        localStorage.setItem('sre_v4_products', JSON.stringify(nextProds));
                        triggerCloudSync({ products: nextProds });
                        return nextProds;
                      });
                    }}
                    onAddAuditLog={addAuditLog}
                    isEncryptedCost={isEncryptedCost}
                    onDeleteProduct={handleDeleteProduct}
                  />
                )}

                {activeTab === 'debts' && (
                  <CustomersDebtsManager
                    customers={customers}
                    debtTransactions={debtTransactions}
                    invoices={invoices}
                    currentUser={currentUser}
                    products={products}
                    inventory={inventory}
                    enterprise={enterprise}
                    onAddInvoice={handleAddInvoice}
                    onAddDebtTransaction={handleAddDebtTransaction}
                    onAddCustomer={handleAddCustomer}
                    onUpdateCustomer={handleUpdateCustomer}
                    onDeleteCustomer={handleDeleteCustomer}
                    onRecordDebtPayment={handleRecordDebtPayment}
                    onAddManualDebt={handleAddManualDebt}
                    onAddAuditLog={addAuditLog}
                    onDeleteDebtTransaction={handleDeleteDebtTransaction}
                    onClearCustomerDebts={handleClearCustomerDebts}
                  />
                )}

                {activeTab === 'sales' && (
                  <InvoiceList
                    invoices={invoices}
                    currentUser={currentUser}
                    onVoidInvoice={handleVoidInvoice}
                    onClearInvoiceHistory={handleClearInvoiceHistory}
                    onAddAuditLog={addAuditLog}
                    enterprise={enterprise}
                  />
                )}

                {activeTab === 'charts' && (
                  <FinancialDashboard
                    invoices={invoices}
                    auditLogs={auditLogs}
                    products={products}
                    inventory={inventory}
                    customers={customers}
                    theme={theme}
                  />
                )}

                {activeTab === 'settings' && (
                  <CashierSettings
                    currentUser={currentUser}
                    usersList={users}
                    onSwitchUser={() => {}}
                    isOffline={isOffline}
                    onToggleOffline={() => setIsOffline(!isOffline)}
                    isEncryptedCost={isEncryptedCost}
                    onToggleCostEncryption={() => setIsEncryptedCost(!isEncryptedCost)}
                    syncQueue={syncQueue}
                    onForceSync={() => triggerCloudSync()}
                    onResetSystem={handleResetSystem}
                    activeUsername={activeCompanyUsername}
                    lastCloudSyncTime={lastCloudSyncTime}
                    isCloudSyncing={isCloudSyncing}
                    cloudSyncError={cloudSyncError}
                    onManualDatabaseSync={() => triggerCloudSync()}
                    onLogout={handleLogout}
                    enterprise={enterprise}
                    onUpdateEnterprise={handleUpdateEnterprise}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* RESPONSIVE BOTTOM NAVIGATION BAR FOR SMARTPHONES & TABLETS */}
          <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around py-2 shadow-lg" dir="ltr">
            <button
              onClick={() => setActiveTab('pos')}
              className={`flex flex-col items-center gap-1 text-[10px] font-bold p-1 cursor-pointer transition-colors ${
                activeTab === 'pos' ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              <Calculator className="w-5 h-5" />
              <span>Iibka</span>
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex flex-col items-center gap-1 text-[10px] font-bold p-1 cursor-pointer transition-colors ${
                activeTab === 'inventory' ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              <Boxes className="w-5 h-5" />
              <span>Bakhaarka</span>
            </button>

            <button
              onClick={() => setActiveTab('debts')}
              className={`flex flex-col items-center gap-1 text-[10px] font-bold p-1 cursor-pointer transition-colors relative ${
                activeTab === 'debts' ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              <Users className="w-5 h-5" />
              <span>Deymaha</span>
              {customers.filter(c => (c.totalDebt || 0) > 0).length > 0 && (
                <span className="absolute top-0 right-1 w-2 h-2 rounded-full bg-red-500"></span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('sales')}
              className={`flex flex-col items-center gap-1 text-[10px] font-bold p-1 cursor-pointer transition-colors ${
                activeTab === 'sales' ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              <Receipt className="w-5 h-5" />
              <span>Rasiidhada</span>
            </button>

            <button
              onClick={() => setActiveTab('charts')}
              className={`flex flex-col items-center gap-1 text-[10px] font-bold p-1 cursor-pointer transition-colors ${
                activeTab === 'charts' ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              <span>Maaliyadda</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex flex-col items-center gap-1 text-[10px] font-bold p-1 cursor-pointer transition-colors ${
                activeTab === 'settings' ? 'text-blue-600' : 'text-slate-500'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span>Habeynta</span>
            </button>
          </div>

        </div>

      </div>
      )}

      {/* LOCAL WI-FI HOTSPOT MODAL FOR MULTI-DEVICE PAIRING */}
      <LocalHotspotModal 
        isOpen={isHotspotModalOpen} 
        onClose={() => setIsHotspotModalOpen(false)} 
      />

    </div>
  );
}

