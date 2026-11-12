/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Product, InvoiceItem, PaymentMethod, User, Customer, ScannerMode } from '../types';
import { 
  Barcode, Search, ShoppingCart, 
  Trash2, Plus, Minus, UserCheck, 
  CheckCircle2, Camera, FileText, AlertCircle, QrCode
} from 'lucide-react';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { OfficialReceipt } from './OfficialReceipt';
import { SmartProductRegisterModal } from './SmartProductRegisterModal';
import { resolveProductFromCode, playScanBeep } from '../lib/barcodeScanner';
import { lookupProductFromDatabase } from '../lib/supabaseDb';

interface CartItem {
  product: Product;
  quantity: number;
  discountPercent: number;
}

interface POSTerminalProps {
  products: Product[];
  currentUser: User;
  customers?: Customer[];
  cart: CartItem[];
  inventory?: any[];
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onUpdateDiscount: (productId: string, discount: number) => void;
  onRemoveFromCart: (productId: string) => void;
  onClearCart: () => void;
  onAddInvoice: (
    items: InvoiceItem[],
    paymentMethod: PaymentMethod,
    totalAmount: number,
    totalCost: number,
    customerId?: string,
    customerName?: string,
    isCreditSale?: boolean
  ) => Promise<boolean> | boolean | void;
  onAddDebtTransaction?: (
    customerId: string, 
    amount: number, 
    notes: string, 
    invoiceNumber: string,
    itemName?: string,
    itemCategory?: string,
    itemQuantity?: number
  ) => void;
  onAddAuditLog: (action: string, details: string, type: 'info' | 'warning' | 'error' | 'success') => void;
  isOffline: boolean;
  onDeleteProduct?: (productId: string) => void;
  enterprise?: any;
  scannerMode: ScannerMode;
  onToggleScannerMode: () => void;
  onTriggerStockInModal?: (productOrBarcode?: Product | string) => void;
  onRegisterProductAndAddToCart?: (product: Product, initialStock: number) => Promise<boolean> | boolean;
  externalTriggerRegisterBarcode?: string | null;
  onClearExternalTriggerBarcode?: () => void;
}

export function POSTerminal({
  products,
  currentUser,
  customers = [],
  cart,
  inventory = [],
  onAddToCart,
  onUpdateQuantity,
  onUpdateDiscount,
  onRemoveFromCart,
  onClearCart,
  onAddInvoice,
  onAddDebtTransaction,
  onAddAuditLog,
  isOffline,
  onDeleteProduct,
  enterprise,
  scannerMode,
  onToggleScannerMode,
  onTriggerStockInModal,
  onRegisterProductAndAddToCart,
  externalTriggerRegisterBarcode,
  onClearExternalTriggerBarcode
}: POSTerminalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSmartRegisterOpen, setIsSmartRegisterOpen] = useState(false);
  const [scannedBarcodeToRegister, setScannedBarcodeToRegister] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [toastNotification, setToastNotification] = useState<{ message: string; type: 'info' | 'success' | 'warning' } | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [lastCreatedInvoice, setLastCreatedInvoice] = useState<any | null>(null);
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const getProductStock = (productId: string) => {
    if (!inventory || !Array.isArray(inventory)) return 0;
    const item = inventory.find((i: any) => i.productId === productId);
    return item ? (Number(item.quantityOnHand) || 0) : 0;
  };

  const showToast = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setToastNotification({ message, type });
    setTimeout(() => {
      setToastNotification(null);
    }, 3500);
  };

  const existingCategories = useMemo(() => {
    return Array.from(new Set(products.map(p => p.category).filter(Boolean)));
  }, [products]);

  // Listen for external hardware scanner unknown barcode triggers
  useEffect(() => {
    if (externalTriggerRegisterBarcode) {
      setScannedBarcodeToRegister(externalTriggerRegisterBarcode);
      setIsSmartRegisterOpen(true);
      if (onClearExternalTriggerBarcode) {
        onClearExternalTriggerBarcode();
      }
    }
  }, [externalTriggerRegisterBarcode, onClearExternalTriggerBarcode]);

  // Keyboard shortcut listener (F2 toggles Scanner Mode, F1 quick checkout)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        onToggleScannerMode();
      } else if (e.key === 'F1') {
        e.preventDefault();
        if (cart.length > 0 && !isSubmittingCheckout) {
          handleCheckout(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, selectedCustomerId, onToggleScannerMode, isSubmittingCheckout]);

  // Totals calculations (Strictly NO VAT)
  const subtotal = cart.reduce((acc, item) => acc + item.product.retailPrice * item.quantity, 0);
  const totalDiscounts = cart.reduce((acc, item) => {
    const itemTotal = item.product.retailPrice * item.quantity;
    return acc + (itemTotal * item.discountPercent) / 100;
  }, 0);
  const totalAmount = Math.max(0, subtotal - totalDiscounts);
  const totalCost = cart.reduce((acc, item) => acc + item.product.costPrice * item.quantity, 0);

  // Checkout Execution with Strict Database Confirmation
  const handleCheckout = async (isCreditSale: boolean = false) => {
    if (isSubmittingCheckout) return;
    if (cart.length === 0) {
      showToast('Gaariga iibku waa maran yahay! Fadlan alaab ku dar marka hore.', 'warning');
      return;
    }

    const selectedCust = customers.find((c) => c.id === selectedCustomerId);

    if (isCreditSale && !selectedCust) {
      showToast('Fadlan marka hore dooro macmiilka aad deynta ku qoraysid!', 'warning');
      return;
    }

    // Check Credit Limit (Xadka Deynta)
    if (isCreditSale && selectedCust) {
      const currentDebt = selectedCust.totalDebt || 0;
      const limit = selectedCust.creditLimit || 250;
      const projectedDebt = currentDebt + totalAmount;

      if (projectedDebt > limit) {
        showToast(`Digniin: Deyntu waxay gaartay $${projectedDebt.toFixed(2)} (Xadka: $${limit.toFixed(2)})`, 'warning');
      }
    }

    const invoiceItems: InvoiceItem[] = cart.map((item) => {
      const finalPrice = item.product.retailPrice * (1 - item.discountPercent / 100);
      return {
        productId: item.product.id,
        productName: item.product.name,
        category: item.product.category || 'Guud',
        sku: item.product.sku,
        quantity: item.quantity,
        soldPrice: Number(finalPrice.toFixed(2)),
        costPrice: item.product.costPrice,
        color: item.product.color,
        size: item.product.size
      };
    });

    const generatedInvoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`;

    setIsSubmittingCheckout(true);
    try {
      const result = await onAddInvoice(
        invoiceItems,
        isCreditSale ? 'credit' : 'cash',
        Number(totalAmount.toFixed(2)),
        Number(totalCost.toFixed(2)),
        selectedCust?.id,
        selectedCust?.name,
        isCreditSale
      );

      if (result === false) {
        showToast('Iibka lama keydin karo database-ka. Fadlan hubi kaydka alaabta ama xiriirka server-ka.', 'warning');
        return;
      }

      if (isCreditSale && selectedCust && onAddDebtTransaction) {
        // Record complete product name and category breakdown in customer's profile file
        const allItemNames = cart.map(it => `${it.quantity}x ${it.product.name}`).join(', ');
        const allCategories = Array.from(new Set(cart.map(it => it.product.category || 'Guud'))).join(', ');
        const detailedDebtNote = cart
          .map(
            (it) =>
              `${it.quantity}x ${it.product.name} [Nuuca: ${it.product.category || 'Guud'}] - $${(
                it.product.retailPrice * (1 - (it.discountPercent || 0) / 100) * it.quantity
              ).toFixed(2)}`
          )
          .join(' | ');

        onAddDebtTransaction(
          selectedCust.id,
          Number(totalAmount.toFixed(2)),
          detailedDebtNote,
          generatedInvoiceNumber,
          allItemNames,
          allCategories,
          cart.reduce((sum, it) => sum + it.quantity, 0)
        );
      }

      setLastCreatedInvoice({
        invoiceNumber: generatedInvoiceNumber,
        timestamp: new Date().toISOString(),
        items: invoiceItems,
        totalAmount: Number(totalAmount.toFixed(2)),
        paymentMethod: isCreditSale ? 'credit' : 'cash',
        cashReceived: isCreditSale ? 0 : (Number(cashReceived) || totalAmount),
        change: isCreditSale ? 0 : Math.max(0, (Number(cashReceived) || totalAmount) - totalAmount),
        cashierName: currentUser.username,
        customerId: selectedCust?.id,
        customerName: selectedCust?.name,
        isCreditSale
      });

      setIsInvoiceModalOpen(true);
      onClearCart();
      setCashReceived('');
      setSelectedCustomerId('');
      showToast('✓ Iibka si guul leh ayaa loo keydiyay database-ka!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Khalad ayaa dhacay markii la xaqiijinayay iibka.', 'warning');
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  // Filter products by search query
  const filteredProducts = products.filter((p) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(query) ||
      p.sku.toLowerCase().includes(query) ||
      (p.barcode && p.barcode.toLowerCase().includes(query)) ||
      (p.qrCode && p.qrCode.toLowerCase().includes(query)) ||
      (p.color && p.color.toLowerCase().includes(query)) ||
      (p.size && p.size.toLowerCase().includes(query))
    );
  });

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const query = searchQuery.trim();
    if (!query) return;

    const { product: found, cleanCode } = resolveProductFromCode(query, products);

    if (found) {
      if (scannerMode === 'in') {
        if (onTriggerStockInModal) onTriggerStockInModal(found);
      } else {
        const stock = getProductStock(found.id);
        const inCart = cart.find(it => it.product.id === found.id)?.quantity || 0;
        if (stock > 0 && inCart + 1 > stock) {
          showToast(`Digniin: Kaydka waxaa ku haray kaliya ${stock} xabbo!`, 'warning');
        }
        onAddToCart(found);
        playScanBeep('success');
        showToast(`✓ ${found.name} - $${found.retailPrice.toFixed(2)} (Kayd: ${stock})`, 'success');
      }
      setSearchQuery('');
    } else {
      if (scannerMode === 'in') {
        if (onTriggerStockInModal) onTriggerStockInModal(cleanCode);
        setSearchQuery('');
      } else {
        // Double check against real database before opening registration modal
        try {
          const dbLookup = await lookupProductFromDatabase(enterprise?.companyCode || 'bulaale', cleanCode || query);
          if (dbLookup.found && dbLookup.product) {
            onAddToCart(dbLookup.product);
            playScanBeep('success');
            showToast(`✓ ${dbLookup.product.name} - $${dbLookup.product.retailPrice.toFixed(2)} (Kayd: ${dbLookup.stock})`, 'success');
            setSearchQuery('');
            return;
          }
        } catch {}

        // Product NOT found in database: automatically open the Smart Product Register Modal!
        playScanBeep('warn');
        setScannedBarcodeToRegister(cleanCode || query);
        setIsSmartRegisterOpen(true);
        showToast(`Alaabta koodhkan (${cleanCode || query}) lama helin. Fadlan buuxi xogta si toos loogu daro kashyarka.`, 'info');
        setSearchQuery('');
      }
    }
  };

  return (
    <div className="relative flex flex-col xl:grid xl:grid-cols-12 gap-5 h-full overflow-y-auto xl:overflow-hidden text-slate-900 dark:text-slate-100 font-sans text-left" dir="ltr" id="pos-terminal-layout">
      
      {/* Toast Notification Banner */}
      {toastNotification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl text-xs font-bold shadow-xl flex items-center gap-2.5 border transition-all ${
          toastNotification.type === 'success'
            ? 'bg-emerald-600 text-white border-emerald-500'
            : toastNotification.type === 'warning'
            ? 'bg-amber-600 text-white border-amber-500'
            : 'bg-slate-900 text-white border-slate-700'
        }`}>
          {toastNotification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{toastNotification.message}</span>
        </div>
      )}

      {/* LEFT COLUMN: Shopping Cart & Order Summary (8 Cols) */}
      <div className="xl:col-span-8 flex flex-col bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-md overflow-hidden h-full rounded-2xl">
        
        {/* Status Header */}
        <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold text-slate-900 dark:text-white capitalize">
              Kashyarka: {currentUser.username}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
              <span>{isOffline ? 'Offline (Keydka Maxalliga)' : 'Local Server (100% Offline)'}</span>
            </div>
          </div>
        </div>

        {/* Barcode Search Row */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
          <form onSubmit={handleSearchSubmit} className="flex gap-2 flex-wrap sm:flex-nowrap">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <Barcode className="w-4 h-4" />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Geli baarkoodh, QR koodh ama raadi magaca alaabta..."
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-medium text-xs focus:outline-none focus:border-blue-500 text-left text-slate-900 dark:text-slate-100"
              />

              {/* Quick Search Auto-Suggest Results Dropdown */}
              {searchQuery.trim().length > 0 && filteredProducts.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                  {filteredProducts.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        if (scannerMode === 'in') {
                          if (onTriggerStockInModal) onTriggerStockInModal(p);
                        } else {
                          onAddToCart(p);
                          playScanBeep('success');
                          showToast(`La helay: ${p.name}`, 'success');
                        }
                        setSearchQuery('');
                      }}
                      className="w-full px-3.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between border-b border-slate-100 dark:border-slate-850 last:border-b-0 cursor-pointer"
                    >
                      <div>
                        <span className="font-bold text-xs text-slate-900 dark:text-white block">{p.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {p.sku} {p.barcode ? `· #${p.barcode}` : ''}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                        ${p.retailPrice.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <button
              id="camera-scan-trigger-btn"
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
              title="Fur Kamerada Baaraha"
            >
              <Camera className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Kamera</span>
            </button>

            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
            >
              <Search className="w-4 h-4" />
              <span>Raadi</span>
            </button>
          </form>
        </div>

        {/* Barcode & QR Scanner Modal */}
        <BarcodeScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          products={products}
          scannerMode={scannerMode}
          onToggleScannerMode={onToggleScannerMode}
          onScanSuccess={async (code, matchedProduct) => {
            const product = matchedProduct || resolveProductFromCode(code, products).product;
            if (scannerMode === 'in') {
              if (onTriggerStockInModal) {
                onTriggerStockInModal(product || code);
              }
              setIsScannerOpen(false);
            } else {
              if (product) {
                const stock = getProductStock(product.id);
                onAddToCart(product);
                playScanBeep('success');
                setIsScannerOpen(false);
                showToast(`✓ ${product.name} - $${product.retailPrice.toFixed(2)} (Kayd: ${stock})`, 'success');
              } else {
                // Check database first
                try {
                  const dbLookup = await lookupProductFromDatabase(enterprise?.companyCode || 'bulaale', code);
                  if (dbLookup.found && dbLookup.product) {
                    onAddToCart(dbLookup.product);
                    playScanBeep('success');
                    setIsScannerOpen(false);
                    showToast(`✓ ${dbLookup.product.name} - $${dbLookup.product.retailPrice.toFixed(2)} (Kayd: ${dbLookup.stock})`, 'success');
                    return;
                  }
                } catch {}

                playScanBeep('warn');
                setIsScannerOpen(false);
                setScannedBarcodeToRegister(code);
                setIsSmartRegisterOpen(true);
                showToast(`Alaabta koodhkan (${code}) lama helin. Fadlan buuxi xogta si toos loogu daro kashyarka.`, 'info');
              }
            }
          }}
        />

        {/* Smart New Product Registration Modal */}
        <SmartProductRegisterModal
          isOpen={isSmartRegisterOpen}
          onClose={() => {
            setIsSmartRegisterOpen(false);
            setTimeout(() => searchInputRef.current?.focus(), 150);
          }}
          scannedBarcode={scannedBarcodeToRegister}
          existingCategories={existingCategories}
          existingProducts={products}
          onSaveAndAddToCart={async (newProd, initialStock) => {
            if (onRegisterProductAndAddToCart) {
              const res = await onRegisterProductAndAddToCart(newProd, initialStock);
              if (res) {
                playScanBeep('success');
                showToast(`Alaabta "${newProd.name}" waa la keydiyay waxaana lagu daray kashyarka!`, 'success');
                return true;
              }
              return false;
            }
            onAddToCart(newProd);
            playScanBeep('success');
            showToast(`Alaabta "${newProd.name}" waa lagu daray kashyarka!`, 'success');
            return true;
          }}
        />

        {/* Spreadsheet Cart Table */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50 dark:bg-slate-950">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-slate-400 dark:text-slate-600 text-center">
              <ShoppingCart className="w-14 h-14 stroke-1 mb-2 text-slate-400 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Gaariga iibku waa maran yahay</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Ku sawir baarkoodhka scanner-ka gacanta ama kamerada si toos ah
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse border-b border-slate-200 dark:border-slate-800 text-xs" dir="ltr">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 uppercase font-black border-b border-slate-300 dark:border-slate-800 select-none">
                    <th className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 text-center w-10">#</th>
                    <th className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 w-24 font-mono">Koodhka</th>
                    <th className="px-4 py-3 border-r border-slate-200 dark:border-slate-800">Magaca Alaabta</th>
                    <th className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 text-center w-32">Tirada</th>
                    <th className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 text-right w-24">Qiimaha</th>
                    <th className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 text-center w-20">Dhimis %</th>
                    <th className="px-4 py-3 border-r border-slate-200 dark:border-slate-800 text-right w-24">Wadarta</th>
                    <th className="px-3 py-3 text-center w-12">Tirtir</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-950 divide-y divide-slate-200 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                  {cart.map((item, idx) => {
                    const itemSubtotal = item.product.retailPrice * item.quantity;
                    const itemDiscount = (itemSubtotal * item.discountPercent) / 100;
                    const itemNet = itemSubtotal - itemDiscount;

                    return (
                      <tr key={item.product.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/60 transition-colors">
                        <td className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 font-mono text-slate-600 dark:text-slate-300 text-[11px]">{item.product.sku}</td>
                        <td className="px-4 py-3 border-r border-slate-200 dark:border-slate-800 text-left font-sans">
                          <span className="font-bold text-slate-900 dark:text-white block">{item.product.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {item.product.color ? `Midab: ${item.product.color} ` : ''}
                            {item.product.size ? `· Size: ${item.product.size} ` : ''}
                            {item.product.barcode ? `· #${item.product.barcode}` : ''}
                          </span>
                        </td>
                        <td className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.product.id, -1)}
                              className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-7 text-center font-bold text-sm font-mono text-slate-900 dark:text-white">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.product.id, 1)}
                              className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 text-right font-mono">
                          ${item.product.retailPrice.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 text-center">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={item.discountPercent || ''}
                            onChange={(e) => onUpdateDiscount(item.product.id, Number(e.target.value) || 0)}
                            placeholder="0"
                            className="w-12 px-1.5 py-1 text-center bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono"
                          />
                        </td>
                        <td className="px-4 py-3 border-r border-slate-200 dark:border-slate-800 text-right font-mono font-black text-slate-900 dark:text-white">
                          ${itemNet.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => onRemoveFromCart(item.product.id)}
                            className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            title="Ka saar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cart Calculations Summary Footer */}
        <div className="bg-slate-100 dark:bg-slate-900 px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-800 dark:text-slate-200">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-slate-500 text-[11px] block">Wadarta</span>
              <span className="font-bold font-mono text-sm">${subtotal.toFixed(2)}</span>
            </div>
            {totalDiscounts > 0 && (
              <div>
                <span className="text-slate-500 text-[11px] block">Dhimis</span>
                <span className="font-bold font-mono text-sm text-red-500">-${totalDiscounts.toFixed(2)}</span>
              </div>
            )}
          </div>
          <div className="text-right">
            <span className="text-slate-500 text-[11px] block">Wadarta Guud</span>
            <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">${totalAmount.toFixed(2)}</span>
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: POS Checkout & Operations (4 Cols) */}
      <div className="xl:col-span-4 flex flex-col gap-4">
        
        {/* Quick Operations Card */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Qaabka Baaraha (Scanner Mode)</span>
            <button
              type="button"
              onClick={onToggleScannerMode}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                scannerMode === 'out'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-emerald-600 text-white shadow-xs'
              }`}
            >
              {scannerMode === 'out' ? 'OUT (Iibka)' : 'IN (Soo Galinta)'}
            </button>
          </div>

          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onClearCart();
                showToast('Gaarigii iibka waa la faaruqiyay', 'info');
              }}
              className="w-full py-2 px-3 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Faaruqi Gaariga ({cart.length} alaab)</span>
            </button>
          )}
        </div>

        {/* POS Finalize Checkout Box */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3">
          
          {/* Customer Selection for Credit */}
          <div className="space-y-1 text-left">
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-slate-600 dark:text-slate-400">
                Macmiilka (Haddii ay deyn tahay)
              </label>
              {selectedCustomerId && (
                <button
                  type="button"
                  onClick={() => setSelectedCustomerId('')}
                  className="text-[10px] text-slate-400 hover:text-red-500 cursor-pointer"
                >
                  Ka saar
                </button>
              )}
            </div>

            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="">-- Iib Caddaan ah --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (Deynta: ${(c.totalDebt || 0).toFixed(2)})
                </option>
              ))}
            </select>

            {/* Selected Customer Financial Status */}
            {selectedCustomerId && (() => {
              const cust = customers.find(c => c.id === selectedCustomerId);
              if (!cust) return null;
              const limit = cust.creditLimit || 250;
              const available = Math.max(0, limit - (cust.totalDebt || 0));
              const willExceed = (cust.totalDebt || 0) + totalAmount > limit;

              return (
                <div className={`p-2 rounded-lg border text-[11px] font-mono ${
                  willExceed
                    ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}>
                  <div className="flex justify-between">
                    <span>Deynta: ${(cust.totalDebt || 0).toFixed(2)}</span>
                    <span>Xadka: ${limit.toFixed(2)}</span>
                    <span>Bannaan: ${available.toFixed(2)}</span>
                  </div>
                  {willExceed && (
                    <div className="text-[10px] font-bold mt-1 text-red-600 font-sans">
                      Digniin: Iibkani wuxuu dhaafayaa xadka deynta!
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Cash Received Input if Cash Sale */}
          {!selectedCustomerId && (
            <div className="space-y-1 text-left">
              <label className="text-[11px] font-medium text-slate-500">
                Lacagta La Qabtay:
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder={`$${totalAmount.toFixed(2)}`}
                  className="flex-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-blue-500"
                />
                {Number(cashReceived) > totalAmount && (
                  <div className="px-2 py-1.5 bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-mono font-bold flex items-center">
                    Celin: ${(Number(cashReceived) - totalAmount).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Checkout Buttons */}
          {selectedCustomerId ? (
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => handleCheckout(false)}
                disabled={cart.length === 0 || isSubmittingCheckout}
                className="py-2.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer bg-slate-800 hover:bg-slate-750 text-white disabled:opacity-40"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isSubmittingCheckout ? 'Waa la keydinayaa...' : `Caddaan ($${totalAmount.toFixed(2)})`}</span>
              </button>

              <button
                type="button"
                onClick={() => handleCheckout(true)}
                disabled={cart.length === 0 || isSubmittingCheckout}
                className="py-2.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isSubmittingCheckout ? 'Waa la keydinayaa...' : `Deyn ($${totalAmount.toFixed(2)})`}</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleCheckout(false)}
              disabled={cart.length === 0 || isSubmittingCheckout}
              className="w-full py-2.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmittingCheckout ? 'Waa la keydinayaa...' : `Dhammeystir ($${totalAmount.toFixed(2)})`}</span>
            </button>
          )}

        </div>
      </div>

      {/* OFFICIAL RECEIPT MODAL */}
      {isInvoiceModalOpen && lastCreatedInvoice && (
        <OfficialReceipt
          invoice={lastCreatedInvoice}
          enterprise={enterprise}
          cashReceived={Number(lastCreatedInvoice.cashReceived)}
          changeDue={Number(lastCreatedInvoice.change)}
          onClose={() => setIsInvoiceModalOpen(false)}
          isModal={true}
        />
      )}
    </div>
  );
}
