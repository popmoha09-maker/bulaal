/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Customer, Product, InventoryItem, InvoiceItem, PaymentMethod, User } from '../types';
import { 
  ShoppingCart, Search, Plus, Minus, Trash2, 
  CreditCard, DollarSign, CheckCircle2, X, AlertTriangle, 
  Package, Tag, Printer, QrCode, Smartphone
} from 'lucide-react';
import { playScanBeep, resolveProductFromCode } from '../lib/barcodeScanner';
import { OfficialReceipt } from './OfficialReceipt';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface CartItem {
  product: Product;
  quantity: number;
  discountPercent: number;
}

interface CustomerPOSModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  products: Product[];
  inventory: InventoryItem[];
  currentUser: User;
  onAddInvoice: (
    items: InvoiceItem[],
    paymentMethod: PaymentMethod,
    totalAmount: number,
    totalCost: number,
    customerId?: string,
    customerName?: string,
    isCreditSale?: boolean
  ) => void;
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
  enterprise?: any;
}

export function CustomerPOSModal({
  isOpen,
  onClose,
  customer,
  products,
  inventory,
  currentUser,
  onAddInvoice,
  onAddDebtTransaction,
  onAddAuditLog,
  enterprise
}: CustomerPOSModalProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [paymentType, setPaymentType] = useState<'credit' | 'cash'>('credit');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [customNotes, setCustomNotes] = useState<string>('');
  const [completedInvoice, setCompletedInvoice] = useState<any | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Helper to get real stock from inventory
  const getProductStock = (productId: string): number => {
    const items = inventory.filter(i => i.productId === productId);
    if (items.length === 0) return 100;
    return items.reduce((sum, item) => sum + (Number(item.quantityOnHand) || 0), 0);
  };

  // Distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return ['all', ...Array.from(set)];
  }, [products]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        p.name.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Add to cart
  const handleAddToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1, discountPercent: 0 }];
    });
    playScanBeep('success');
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.product.id === productId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null)
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Handle scanned barcode from scanner modal
  const handleScannedProduct = (code: string, matchedProduct?: Product | null) => {
    const product = matchedProduct || resolveProductFromCode(code, products).product;
    if (product) {
      handleAddToCart(product);
      setIsScannerOpen(false);
    }
  };

  // Totals calculations
  const totalAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.retailPrice * item.quantity, 0);
  }, [cart]);

  const totalCost = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.costPrice * item.quantity, 0);
  }, [cart]);

  const totalItemsCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Credit limits
  const currentDebt = customer.totalDebt || 0;
  const creditLimit = customer.creditLimit || 250;
  const newDebtIfCredit = currentDebt + totalAmount;
  const willExceedLimit = paymentType === 'credit' && newDebtIfCredit > creditLimit;

  // Process checkout
  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || totalAmount <= 0) return;

    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const invoiceItems: InvoiceItem[] = cart.map(item => ({
      productId: item.product.id,
      sku: item.product.sku || item.product.id,
      productName: item.product.name,
      quantity: item.quantity,
      costPrice: item.product.costPrice,
      retailPrice: item.product.retailPrice,
      discountPercent: 0,
      soldPrice: item.product.retailPrice,
      category: item.product.category || 'Guud'
    }));

    // Specific product names explicitly formatted: e.g. "Timir (Dates) 1kg" or "2x Timir"
    const itemNamesFormatted = cart
      .map(item => `${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.product.name}`)
      .join(', ');

    const itemCategoriesFormatted = Array.from(
      new Set(cart.map(item => item.product.category || 'Guud'))
    ).join(', ');

    const detailedItemsNote = cart
      .map(item => `${item.quantity}x ${item.product.name} ($${item.product.retailPrice.toFixed(2)})`)
      .join(' | ');

    const finalNotes = customNotes.trim()
      ? `${customNotes.trim()} (${detailedItemsNote})`
      : detailedItemsNote;

    let isCreditSale = false;
    let paymentMethod: PaymentMethod = 'cash';

    if (paymentType === 'credit') {
      isCreditSale = true;
      paymentMethod = 'credit';

      onAddInvoice(
        invoiceItems,
        'credit',
        totalAmount,
        totalCost,
        customer.id,
        customer.name,
        true
      );

      if (onAddDebtTransaction) {
        onAddDebtTransaction(
          customer.id,
          totalAmount,
          finalNotes,
          invoiceNumber,
          itemNamesFormatted,
          itemCategoriesFormatted,
          totalItemsCount
        );
      }

      onAddAuditLog(
        'Iib Deyn ah (POS Macmiil)',
        `Waxaa deyn ahaan $${totalAmount.toFixed(2)} looga iibiyay macmiilka "${customer.name}". Alaabta: ${itemNamesFormatted}.`,
        'warning'
      );
    } else if (paymentType === 'cash') {
      isCreditSale = false;
      paymentMethod = 'cash';

      onAddInvoice(
        invoiceItems,
        'cash',
        totalAmount,
        totalCost,
        customer.id,
        customer.name,
        false
      );

      onAddAuditLog(
        'Iib Caddaan ah (POS Macmiil)',
        `Waxaa caddaan ahaan $${totalAmount.toFixed(2)} looga iibiyay macmiilka "${customer.name}". Alaabta: ${itemNamesFormatted}.`,
        'success'
      );
    }

    const createdInv = {
      id: `inv_${Date.now()}`,
      invoiceNumber,
      timestamp: new Date().toISOString(),
      userId: currentUser.id,
      cashierName: currentUser.username,
      items: invoiceItems,
      totalAmount,
      totalCost,
      paymentMethod,
      customerId: customer.id,
      customerName: customer.name,
      isCreditSale
    };

    setCompletedInvoice(createdInv);
    setShowReceipt(true);
    playScanBeep('success');
    setCart([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-xs font-sans">
      
      {/* Barcode Scanner Modal Integration */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        products={products}
        onScanSuccess={handleScannedProduct}
        scannerMode="out"
      />

      {/* RECEIPT PREVIEW / PRINT MODAL */}
      {showReceipt && completedInvoice && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Iibka Waa La Diiwaangeliyay!
            </h3>
            
            <p className="text-xs text-slate-500">
              Alaabta waxaa si toos ah loogu daray faylka macmiilka <span className="font-bold text-slate-800 dark:text-slate-200">{customer.name}</span>.
            </p>

            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-left text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Rasiidka #:</span>
                <span className="font-bold text-slate-900 dark:text-white">{completedInvoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Wadarta:</span>
                <span className="font-bold text-emerald-600">${completedInvoice.totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nuuca:</span>
                <span className="font-bold text-blue-600">{completedInvoice.isCreditSale ? 'Deyn (Credit)' : 'Caddaan (Cash)'}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Daabac</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowReceipt(false);
                  setCompletedInvoice(null);
                  onClose();
                }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer"
              >
                Xir
              </button>
            </div>

            <div className="hidden">
              <OfficialReceipt
                invoice={completedInvoice}
                enterprise={enterprise || { companyName: 'BULAALE MINI MARKET', companyLocation: 'Main Branch' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* COMPACT, SMOOTH, FULLY RESPONSIVE POS MODAL */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl max-h-[92vh] sm:max-h-[88vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* COMPACT HEADER: CUSTOMER BADGE & ACTION CONTROLS */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between gap-2 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black shrink-0">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                  POS Macmiil: {customer.name}
                </h3>
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                {customer.phone} • Deynta: <span className="text-red-400 font-mono font-bold">${currentDebt.toFixed(2)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick Barcode Scanner Trigger */}
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-lg border border-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              title="Baar Koodhka (Camera/Barcode)"
            >
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline text-[11px]">Baar</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SEARCH & CATEGORY FILTER BAR */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-850 bg-slate-50/70 dark:bg-slate-900/50 space-y-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Raadi magaca alaabta (sida: Timir, Bariis, Sonkor)..."
              className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                {cat === 'all' ? 'Dhammaan' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* PRODUCT SHELF GRID (COMPACT & TOUCH-FRIENDLY) */}
        <div className="flex-1 overflow-y-auto p-3 min-h-[160px] max-h-[300px] border-b border-slate-200 dark:border-slate-850">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs py-8 text-center">
              <Package className="w-8 h-8 stroke-1 mb-1 text-slate-400" />
              <p className="font-semibold text-slate-600 dark:text-slate-300">Alaab lagama helin</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredProducts.map(product => {
                const stock = getProductStock(product.id);
                const inCart = cart.find(i => i.product.id === product.id);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleAddToCart(product)}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer relative group active:scale-[0.99] ${
                      inCart
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-850'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold truncate">
                          {product.category || 'Guud'}
                        </span>
                        {product.sku && (
                          <span className="text-[9px] font-mono text-slate-400">
                            {product.sku}
                          </span>
                        )}
                        <span className="text-[9px] font-mono font-bold text-slate-400">
                          • Kayd: {stock}
                        </span>
                      </div>

                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">
                        {product.name}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-xs sm:text-sm font-mono font-black text-emerald-600 dark:text-emerald-400">
                        ${product.retailPrice.toFixed(2)}
                      </span>
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs transition-colors ${
                        inCart
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 group-hover:bg-blue-600 group-hover:text-white'
                      }`}>
                        {inCart ? inCart.quantity : '+'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* COMPACT CART SUMMARY & SELECTED ITEMS */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-[120px] max-h-[190px] bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400 pb-1">
            <span>Alaabta La Doortay ({totalItemsCount}):</span>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={handleClearCart}
                className="text-red-500 hover:text-red-600 text-[10px] cursor-pointer"
              >
                Faaruqi
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="py-5 text-center text-slate-400 text-xs">
              Guji alaabta sare (sida Timir) si aad ugu darto iibka
            </div>
          ) : (
            cart.map(item => (
              <div
                key={item.product.id}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900 dark:text-white truncate">
                    {item.product.name}
                  </div>
                  <div className="text-[10px] text-emerald-600 font-mono font-semibold">
                    ${item.product.retailPrice.toFixed(2)} x {item.quantity}
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleUpdateQuantity(item.product.id, -1)}
                    className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold hover:bg-slate-200 cursor-pointer text-xs"
                  >
                    -
                  </button>
                  <span className="w-5 text-center font-mono font-bold text-slate-900 dark:text-white text-xs">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateQuantity(item.product.id, 1)}
                    className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold hover:bg-slate-200 cursor-pointer text-xs"
                  >
                    +
                  </button>
                </div>

                {/* Subtotal & Delete */}
                <span className="font-mono font-black text-slate-900 dark:text-white text-xs min-w-[50px] text-right">
                  ${(item.product.retailPrice * item.quantity).toFixed(2)}
                </span>

                <button
                  type="button"
                  onClick={() => handleRemoveFromCart(item.product.id)}
                  className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* COMPACT CHECKOUT & PAYMENT METHOD SELECTOR */}
        <form onSubmit={handleCheckout} className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-2.5 shrink-0">
          
          {/* 2 Payment Modes: Credit & Cash */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentType('credit')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                paymentType === 'credit'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Deyn (Credit)</span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentType('cash')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                paymentType === 'cash'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Kaash (Cash)</span>
            </button>
          </div>

          {/* Dynamic input for cash */}
          {paymentType === 'cash' && (
            <div className="flex items-center justify-between gap-2 text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 shrink-0 font-medium">Lacagta La Dhiibay:</span>
              <input
                type="number"
                step="0.01"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                placeholder={`$${totalAmount.toFixed(2)}`}
                className="w-28 px-2.5 py-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-right"
              />
              {parseFloat(cashReceived) > totalAmount && (
                <span className="text-emerald-600 font-mono font-bold text-[11px] shrink-0">
                  Celin: ${(parseFloat(cashReceived) - totalAmount).toFixed(2)}
                </span>
              )}
            </div>
          )}

          {/* Sticky Total & Submit Bar */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="min-w-0">
              <span className="text-[10px] text-slate-500 block">Wadarta Guud</span>
              <span className="text-base font-mono font-black text-slate-900 dark:text-white">
                ${totalAmount.toFixed(2)}
              </span>
            </div>

            <button
              type="submit"
              disabled={cart.length === 0 || totalAmount <= 0}
              className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                paymentType === 'credit'
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {paymentType === 'credit'
                  ? `Diiwaangeli Deyn ($${totalAmount.toFixed(2)})`
                  : `Xaqiiji Iibka ($${totalAmount.toFixed(2)})`
                }
              </span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
