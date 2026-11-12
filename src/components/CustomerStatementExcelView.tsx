/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Customer, DebtTransaction, Invoice, User, Product, InventoryItem, InvoiceItem, PaymentMethod } from '../types';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Search,
  ArrowLeft,
  Plus,
  DollarSign,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  RefreshCw,
  Trash2,
  Receipt,
  User as UserIcon,
  Phone,
  MapPin,
  Maximize2,
  Minimize2,
  Tag,
  Package,
  ShoppingCart
} from 'lucide-react';
import { CustomerPOSModal } from './CustomerPOSModal';

interface CustomerStatementExcelViewProps {
  customer: Customer;
  debtTransactions: DebtTransaction[];
  invoices: Invoice[];
  currentUser: User;
  onClose: () => void;
  onRecordDebtPayment: (customerId: string, amount: number, notes: string) => void;
  onAddManualDebt: (
    customerId: string, 
    amount: number, 
    notes: string,
    itemName?: string,
    itemCategory?: string,
    itemQuantity?: number
  ) => void;
  onDeleteDebtTransaction?: (transactionId: string, customerId: string) => void;
  onClearCustomerDebts?: (customerId: string) => void;
  products?: Product[];
  inventory?: InventoryItem[];
  onAddInvoice?: (
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
  onAddAuditLog?: (action: string, details: string, type: 'info' | 'warning' | 'error' | 'success') => void;
  enterprise?: any;
  storeName?: string;
  storePhone?: string;
  storeLocation?: string;
}

export function CustomerStatementExcelView({
  customer,
  debtTransactions,
  invoices,
  currentUser,
  onClose,
  onRecordDebtPayment,
  onAddManualDebt,
  onDeleteDebtTransaction,
  onClearCustomerDebts,
  products = [],
  inventory = [],
  onAddInvoice,
  onAddDebtTransaction,
  onAddAuditLog,
  enterprise,
  storeName = 'BULAALE MINI MARKET',
  storePhone,
  storeLocation = 'Main Branch'
}: CustomerStatementExcelViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [isFullWindow, setIsFullWindow] = useState(true);

  // Quick Action Modal states
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
  const [isPOSOpen, setIsPOSOpen] = useState(false);
  const [isClearAllConfirmOpen, setIsClearAllConfirmOpen] = useState(false);
  const [actionAmount, setActionAmount] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [actionItemName, setActionItemName] = useState('');
  const [actionItemCategory, setActionItemCategory] = useState('');
  const [actionItemQty, setActionItemQty] = useState('1');
  const [transactionToDelete, setTransactionToDelete] = useState<any | null>(null);

  // Dynamically computed live debt balance reflecting any deleted or added transaction immediately
  const currentOutstandingDebt = useMemo(() => {
    const custTxs = debtTransactions.filter((t) => t.customerId === customer.id);
    if (custTxs.length > 0) {
      const debits = custTxs
        .filter((t) => t.type === 'debt_incurred')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const credits = custTxs
        .filter((t) => t.type === 'payment_received')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      return Math.max(0, debits - credits);
    }
    return customer.totalDebt || 0;
  }, [debtTransactions, customer.id, customer.totalDebt]);

  // Filter transactions for this customer
  const customerTransactions = useMemo(() => {
    let txs = debtTransactions.filter((t) => t.customerId === customer.id);

    // Apply date filter
    const now = new Date();
    if (dateFilter === 'today') {
      const todayStr = now.toISOString().slice(0, 10);
      txs = txs.filter((t) => t.timestamp.startsWith(todayStr));
    } else if (dateFilter === '7days') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      txs = txs.filter((t) => new Date(t.timestamp) >= sevenDaysAgo);
    } else if (dateFilter === '30days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      txs = txs.filter((t) => new Date(t.timestamp) >= thirtyDaysAgo);
    }

    // Apply text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      txs = txs.filter(
        (t) =>
          t.invoiceNumber?.toLowerCase().includes(q) ||
          t.itemName?.toLowerCase().includes(q) ||
          t.itemCategory?.toLowerCase().includes(q) ||
          t.notes?.toLowerCase().includes(q) ||
          t.recordedBy?.toLowerCase().includes(q) ||
          t.amount.toString().includes(q)
      );
    }

    // Chronological order (Oldest first for running balance ledger)
    return [...txs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [debtTransactions, customer.id, dateFilter, searchQuery]);

  // Find detailed items for each transaction from invoices and explicit fields
  const transactionRows = useMemo(() => {
    let runningBalance = 0;

    return customerTransactions.map((tx, idx) => {
      const isPayment = tx.type === 'payment_received';
      const debit = isPayment ? 0 : tx.amount;
      const credit = isPayment ? tx.amount : 0;
      runningBalance = runningBalance + debit - credit;

      // Extract item name, item category/type, quantity
      let productName = tx.itemName || '';
      let productCategory = tx.itemCategory || '';
      let productQty = tx.itemQuantity ? `${tx.itemQuantity} xabbo` : '';
      let itemDetails = tx.notes || '';

      if (tx.invoiceNumber || tx.invoiceId) {
        const inv = invoices.find(
          (i) => (i.invoiceNumber && tx.invoiceNumber && i.invoiceNumber.trim() === tx.invoiceNumber.trim()) ||
                 (tx.invoiceId && i.id === tx.invoiceId) ||
                 (tx.invoiceNumber && i.invoiceNumber && (i.invoiceNumber.includes(tx.invoiceNumber) || tx.invoiceNumber.includes(i.invoiceNumber)))
        );
        if (inv && inv.items && inv.items.length > 0) {
          productName = inv.items.map((it) => `${it.quantity > 1 ? `${it.quantity}x ` : ''}${it.productName}`).join(', ');
          productCategory = Array.from(new Set(inv.items.map((it) => it.category || 'Guud'))).join(', ');
          const totalQty = inv.items.reduce((s, it) => s + it.quantity, 0);
          productQty = `${totalQty} xabbo`;
          itemDetails = inv.items
            .map((it) => `${it.quantity}x ${it.productName} [Nuuca: ${it.category || 'Guud'}] ($${it.soldPrice.toFixed(2)})`)
            .join(' | ');
        }
      }

      if (isPayment) {
        productName = productName || 'Gudis Lacageed (Payment)';
        productCategory = 'Lacag Caddaan';
        productQty = '-';
      } else {
        // Prioritize explicit item name or extract clean product title from notes
        if (!productName && tx.notes) {
          const match = tx.notes.match(/(?:(?:\d+x\s+)?([^[($|]+))/);
          if (match && match[1] && !match[1].toLowerCase().includes('deyn')) {
            productName = match[1].trim();
          }
        }
        productName = productName || tx.notes || 'Alaab Deyn ah';
        productCategory = productCategory || 'Guud';
        productQty = productQty || '1 xabbo';
      }

      return {
        ...tx,
        rowNumber: idx + 1,
        productName,
        productCategory,
        productQty,
        debit,
        credit,
        runningBalance: tx.balanceAfter !== undefined ? tx.balanceAfter : runningBalance,
        itemDetails: itemDetails || `${productQty} ${productName}`
      };
    });
  }, [customerTransactions, invoices]);

  // Overall Totals calculation
  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;

    transactionRows.forEach((r) => {
      totalDebit += r.debit;
      totalCredit += r.credit;
    });

    const netRemaining = totalDebit - totalCredit;

    return {
      totalDebit,
      totalCredit,
      netRemaining,
      currentCustomerDebt: currentOutstandingDebt,
      count: transactionRows.length
    };
  }, [transactionRows, currentOutstandingDebt]);

  // Export to CSV formatted for Microsoft Excel with explicit Item Name and Category columns
  const handleExportExcelCSV = () => {
    const headers = [
      '#',
      'Taariikhda (Date)',
      'Waqtiga (Time)',
      'Nuuca (Type)',
      'Rasiidka (Invoice/Ref #)',
      'Magaca Alaabta (Product Name)',
      'Nuuca Alaabta (Category / Type)',
      'Tirada (Quantity)',
      'Faahfaahinta / Xusuus (Notes / Details)',
      'Deyn Cusub (Debit +)',
      'La Bixiyay (Credit -)',
      'Haraaga (Running Balance)',
      'Qoraha (Cashier)'
    ];

    const rows = transactionRows.map((r) => {
      const d = new Date(r.timestamp);
      const datePart = d.toLocaleDateString();
      const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const typeStr = r.type === 'payment_received' ? 'Gudis Lacageed' : 'Iib Deyn ah';

      return [
        r.rowNumber,
        `"${datePart}"`,
        `"${timePart}"`,
        `"${typeStr}"`,
        `"${r.invoiceNumber || '-'}"`,
        `"${(r.productName || '').replace(/"/g, '""')}"`,
        `"${(r.productCategory || '').replace(/"/g, '""')}"`,
        `"${r.productQty}"`,
        `"${(r.itemDetails || '').replace(/"/g, '""')}"`,
        r.debit > 0 ? r.debit.toFixed(2) : '0.00',
        r.credit > 0 ? r.credit.toFixed(2) : '0.00',
        r.runningBalance.toFixed(2),
        `"${r.recordedBy}"`
      ].join(',');
    });

    // Add TOTALS row at bottom of Excel CSV
    const totalRow = [
      'TOTAL :',
      '""',
      '""',
      '""',
      '""',
      `"Wadarta Dhaqdhaqaaqa (${totals.count})"`,
      '""',
      '""',
      '""',
      totals.totalDebit.toFixed(2),
      totals.totalCredit.toFixed(2),
      totals.currentCustomerDebt.toFixed(2),
      '""'
    ].join(',');

    const summaryMeta = [
      `"BULAALE MINI MARKET - XAASHIDA XISAABTA MACMIILKA (CUSTOMER STATEMENT)"`,
      `"Macmiilka: ${customer.name}"`,
      `"Telefoonka: ${customer.phone}"`,
      `"Goobta: ${customer.address || 'N/A'}"`,
      `"Deynta Hadda Maqan: $${currentOutstandingDebt.toFixed(2)}"`,
      `"Taariikhda La Soo Saaray: ${new Date().toLocaleString()}"`,
      ''
    ].join('\n');

    const csvContent = summaryMeta + '\n' + headers.join(',') + '\n' + rows.join('\n') + '\n' + totalRow;
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Excel_Statement_${customer.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  // Submit quick payment
  const handleQuickPaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(actionAmount);
    if (isNaN(amt) || amt <= 0) return;
    onRecordDebtPayment(customer.id, amt, actionNote.trim() || 'Gudidda deynta (Excel Sheet)');
    setIsPayModalOpen(false);
    setActionAmount('');
    setActionNote('');
  };

  // Submit quick charge with structured item name, item category/type, and quantity
  const handleQuickChargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(actionAmount);
    if (isNaN(amt) || amt <= 0) return;
    const finalItemName = actionItemName.trim() || actionNote.trim() || 'Alaab deyn ah';
    const finalItemCategory = actionItemCategory.trim() || 'Guud';
    const finalItemQty = parseInt(actionItemQty) || 1;
    const finalNote = actionNote.trim()
      ? `${finalItemQty}x ${finalItemName} [Nuuca: ${finalItemCategory}] - ${actionNote.trim()}`
      : `${finalItemQty}x ${finalItemName} [Nuuca: ${finalItemCategory}]`;

    onAddManualDebt(
      customer.id, 
      amt, 
      finalNote,
      finalItemName,
      finalItemCategory,
      finalItemQty
    );
    setIsChargeModalOpen(false);
    setActionAmount('');
    setActionNote('');
    setActionItemName('');
    setActionItemCategory('');
    setActionItemQty('1');
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans select-text overflow-hidden ${
        isFullWindow ? 'p-0' : 'p-3 sm:p-6'
      }`}
      dir="ltr"
    >
      {/* EXCEL APPLICATION CONTAINER */}
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 shadow-2xl overflow-hidden rounded-none">
        
        {/* MICROSOFT EXCEL GREEN BANNER & TOOLBAR */}
        <div className="bg-[#107c41] text-white px-4 py-2.5 flex items-center justify-between shrink-0 select-none shadow-md">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-black/20 rounded-lg text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="Ku Noqo (Back)"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Ku Noqo</span>
            </button>

            <div className="h-5 w-[1px] bg-white/30" />

            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-white text-[#107c41] flex items-center justify-center font-black text-xs shadow-xs">
                X
              </div>
              <div>
                <h1 className="text-xs sm:text-sm font-bold tracking-tight flex items-center gap-2">
                  <span>Xaashida Xisaabta Macmiilka (Customer Statement)</span>
                  <span className="text-white/80 font-normal">|</span>
                  <span className="font-extrabold text-white underline decoration-emerald-300">
                    {customer.name}
                  </span>
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Direct Customer POS Button */}
            <button
              type="button"
              onClick={() => setIsPOSOpen(true)}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm border border-emerald-400/40"
              title="Iibi Alaab Cusub (POS Toos ah oo ku dhex jira faylka macmiilka)"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>🛒 POS Macmiilka</span>
            </button>

            {/* Export Excel Button */}
            <button
              type="button"
              onClick={handleExportExcelCSV}
              className="px-2.5 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
              title="Dhoofi Faylka Excel (.CSV)"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Dhoofi Excel (.csv)</span>
              <span className="sm:hidden">Excel</span>
            </button>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-2.5 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
              title="Daabac Xaashida"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Daabac</span>
            </button>

            {/* Toggle Full Screen */}
            <button
              type="button"
              onClick={() => setIsFullWindow(!isFullWindow)}
              className="p-1.5 hover:bg-white/20 rounded-lg text-white transition-colors cursor-pointer"
              title={isFullWindow ? 'Dhexdhexaad' : 'Shaashad Buuxda'}
            >
              {isFullWindow ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* CUSTOMER PROFILE & METRIC CARDS HEADER */}
        <div className="bg-slate-50 dark:bg-slate-950 border-b border-slate-300 dark:border-slate-800 p-3 sm:p-4 shrink-0">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            
            {/* Customer Details */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-600/20 flex items-center justify-center font-bold text-lg shrink-0">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-display">
                    {customer.name}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    ID: #{customer.id.slice(-6).toUpperCase()}
                  </span>
                  {currentOutstandingDebt > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                      Deyn Leh (${currentOutstandingDebt.toFixed(2)})
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                      Xisaabtu Waa Nadiif
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 font-mono text-slate-700 dark:text-slate-300">
                    <Phone className="w-3 h-3 text-slate-400" />
                    {customer.phone}
                  </span>
                  {customer.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      {customer.address}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[11px]">
                    <Clock className="w-3 h-3 text-slate-400" />
                    Diiwaangelin: {new Date(customer.createdAt || Date.now()).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions & Financial KPI Badges */}
            <div className="flex items-center gap-2.5 flex-wrap">
              
              {/* Outstanding Debt KPI */}
              <div className="px-3.5 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-right">
                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider block">
                  Deynta Hadda Maqan
                </span>
                <span className="text-base sm:text-lg font-mono font-black text-red-600 dark:text-red-400">
                  ${currentOutstandingDebt.toFixed(2)}
                </span>
              </div>

              {/* Credit Limit KPI */}
              <div className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-right">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Xadka Deynta
                </span>
                <span className="text-base sm:text-lg font-mono font-bold text-slate-800 dark:text-slate-200">
                  ${(customer.creditLimit || 250).toFixed(2)}
                </span>
              </div>

              {/* Primary Action: Direct Customer POS */}
              <button
                type="button"
                onClick={() => setIsPOSOpen(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer transition-all hover:scale-[1.02]"
                title="Iibi Alaab Cusub (POS Toos ah)"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>🛒 POS Macmiilka</span>
              </button>

              {/* Action: Pay Debt */}
              <button
                type="button"
                onClick={() => {
                  setActionAmount(currentOutstandingDebt.toString());
                  setActionNote('Gudis lacageed oo degdeg ah');
                  setIsPayModalOpen(true);
                }}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                title="Qabo Lacagta Deynta"
              >
                <DollarSign className="w-4 h-4" />
                <span>Gud Deyn</span>
              </button>

              {/* Action: Add Debt */}
              <button
                type="button"
                onClick={() => {
                  setActionAmount('');
                  setActionNote('');
                  setActionItemName('');
                  setActionItemCategory('');
                  setActionItemQty('1');
                  setIsChargeModalOpen(true);
                }}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                title="Ku dar deyn cusub oo qor magaca alaabta & nuuceeda"
              >
                <Plus className="w-4 h-4" />
                <span>Deyn Ku Dar</span>
              </button>

              {/* Action: Clear All Debts for this Customer */}
              {onClearCustomerDebts && transactionRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsClearAllConfirmOpen(true)}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                  title="Tirtir dhammaan taariikhda deynta macmiilkan"
                >
                  <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Tirtir Taariikhda</span>
                </button>
              )}

            </div>

          </div>
        </div>

        {/* EXCEL FORMULA BAR & FILTER CONTROLS */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0 text-xs select-none">
          
          {/* Formula bar style indicator */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
              fx
            </span>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
              =SUM(DEBITS) - SUM(CREDITS) = <strong className="text-red-600 dark:text-red-400">${totals.currentCustomerDebt.toFixed(2)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* Date quick filter */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setDateFilter('all')}
                className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                  dateFilter === 'all' ? 'bg-white dark:bg-slate-700 text-[#107c41] font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Dhammaan ({debtTransactions.filter(t => t.customerId === customer.id).length})
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('today')}
                className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                  dateFilter === 'today' ? 'bg-white dark:bg-slate-700 text-[#107c41] font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Maanta
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('7days')}
                className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                  dateFilter === '7days' ? 'bg-white dark:bg-slate-700 text-[#107c41] font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                7 Maalmood
              </button>
              <button
                type="button"
                onClick={() => setDateFilter('30days')}
                className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                  dateFilter === '30days' ? 'bg-white dark:bg-slate-700 text-[#107c41] font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                30 Maalmood
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Raadi magaca alaabta ama rasiidka..."
                className="pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#107c41] w-48 sm:w-56"
              />
            </div>
          </div>
        </div>

        {/* FULL EXCEL SPREADSHEET TABLE WITH VERTICAL SCROLLING */}
        <div className="flex-1 overflow-auto bg-white dark:bg-slate-950 min-h-[350px]">
          <table className="w-full text-left border-collapse text-xs select-text" dir="ltr">
            
            {/* EXCEL COLUMN IDENTIFIER HEADER (A, B, C, D, E, F, G, H, I, J, K, L) */}
            <thead className="sticky top-0 z-20 bg-slate-200 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 text-[10px] font-mono border-b border-slate-300 dark:border-slate-700 select-none">
              <tr>
                <th className="px-2 py-1 border-r border-slate-300 dark:border-slate-700 text-center w-10 bg-slate-300 dark:bg-slate-800">A</th>
                <th className="px-3 py-1 border-r border-slate-300 dark:border-slate-700 w-32">B</th>
                <th className="px-3 py-1 border-r border-slate-300 dark:border-slate-700 w-28">C</th>
                <th className="px-3 py-1 border-r border-slate-300 dark:border-slate-700 w-32">D</th>
                <th className="px-4 py-1 border-r border-slate-300 dark:border-slate-700 min-w-[180px]">E</th>
                <th className="px-3 py-1 border-r border-slate-300 dark:border-slate-700 w-36">F</th>
                <th className="px-3 py-1 border-r border-slate-300 dark:border-slate-700 text-center w-20">G</th>
                <th className="px-3 py-1 border-r border-slate-300 dark:border-slate-700 text-right w-28">H</th>
                <th className="px-3 py-1 border-r border-slate-300 dark:border-slate-700 text-right w-28">I</th>
                <th className="px-3 py-1 border-r border-slate-300 dark:border-slate-700 text-right w-32">J</th>
                <th className="px-3 py-1 border-r border-slate-300 dark:border-slate-700 w-24">K</th>
                <th className="px-3 py-1 text-center w-16">L</th>
              </tr>
            </thead>

            {/* REAL LABELS HEADER WITH EXPLICIT PRODUCT NAME & PRODUCT TYPE */}
            <thead className="sticky top-[25px] z-10 bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-black border-b-2 border-slate-300 dark:border-slate-700 text-xs select-none">
              <tr>
                <th className="px-2 py-2 border-r border-slate-300 dark:border-slate-700 text-center bg-slate-200 dark:bg-slate-800/80">#</th>
                <th className="px-3 py-2 border-r border-slate-300 dark:border-slate-700">Taariikhda & Waqtiga</th>
                <th className="px-3 py-2 border-r border-slate-300 dark:border-slate-700">Nuuca Hawsha</th>
                <th className="px-3 py-2 border-r border-slate-300 dark:border-slate-700">Rasiidka / Ref</th>
                <th className="px-4 py-2 border-r border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
                  Magaca Alaabta
                </th>
                <th className="px-3 py-2 border-r border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white">
                  Nuuca Alaabta
                </th>
                <th className="px-3 py-2 border-r border-slate-300 dark:border-slate-700 text-center">Tirada</th>
                <th className="px-3 py-2 border-r border-slate-300 dark:border-slate-700 text-right text-red-600 dark:text-red-400">Deyn Cusub (+)</th>
                <th className="px-3 py-2 border-r border-slate-300 dark:border-slate-700 text-right text-emerald-600 dark:text-emerald-400">La Bixiyay (-)</th>
                <th className="px-3 py-2 border-r border-slate-300 dark:border-slate-700 text-right text-slate-900 dark:text-white">Haraaga Xisaabta</th>
                <th className="px-3 py-2 border-r border-slate-300 dark:border-slate-700">Qoraha</th>
                <th className="px-3 py-2 text-center">Tirtir</th>
              </tr>
            </thead>

            {/* TABLE ROWS */}
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
              {transactionRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-slate-400">
                    <FileSpreadsheet className="w-12 h-12 mx-auto mb-2 opacity-30 text-[#107c41]" />
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                      Ma jirto wax dhaqdhaqaaq deyn ah oo la helay
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Guji "Deyn Ku Dar" si aad u qorto magaca alaabta, nuuceeda, iyo qiimaha deynta.
                    </p>
                  </td>
                </tr>
              ) : (
                transactionRows.map((row) => {
                  const isPayment = row.type === 'payment_received';
                  const d = new Date(row.timestamp);

                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors group"
                    >
                      {/* Row Number */}
                      <td className="px-2 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center font-mono text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-900/60 font-bold select-none">
                        {row.rowNumber}
                      </td>

                      {/* Date & Time */}
                      <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 font-mono text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">
                        <div className="font-bold">{d.toLocaleDateString()}</div>
                        <div className="text-[10px] text-slate-400">
                          {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      {/* Type */}
                      <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            isPayment
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                              : 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-400 border border-red-300 dark:border-red-800'
                          }`}
                        >
                          {isPayment ? (
                            <>
                              <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                              <span>Gudis Deyn</span>
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="w-3 h-3 text-red-600" />
                              <span>Iib Deyn ah</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* Reference / Invoice # */}
                      <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 font-mono text-xs text-blue-600 dark:text-blue-400 font-bold whitespace-nowrap">
                        {row.invoiceNumber ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900">
                            #{row.invoiceNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">Gacanta (Manual)</span>
                        )}
                      </td>

                      {/* COLUMN E: MAGACA ALAABTA (PRODUCT NAME) */}
                      <td className="px-4 py-2.5 border-r border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs">
                        <div className="font-bold flex items-center gap-1.5" title={row.productName}>
                          <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{row.productName}</span>
                        </div>
                        {row.itemDetails && row.itemDetails !== row.productName && (
                          <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5" title={row.itemDetails}>
                            {row.itemDetails}
                          </div>
                        )}
                      </td>

                      {/* COLUMN F: NUUCA ALAABTA (CATEGORY / TYPE) */}
                      <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
                          <Tag className="w-2.5 h-2.5 text-slate-400" />
                          <span>{row.productCategory}</span>
                        </span>
                      </td>

                      {/* COLUMN G: TIRADA (QUANTITY) */}
                      <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center font-mono font-bold text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {row.productQty}
                      </td>

                      {/* Debit (Debt Added +) */}
                      <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-right font-mono font-bold text-xs whitespace-nowrap">
                        {row.debit > 0 ? (
                          <span className="text-red-600 dark:text-red-400">
                            +${row.debit.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Credit (Paid -) */}
                      <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-right font-mono font-bold text-xs whitespace-nowrap">
                        {row.credit > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            -${row.credit.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Running Balance */}
                      <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-right font-mono font-black text-xs text-slate-900 dark:text-white whitespace-nowrap">
                        ${row.runningBalance.toFixed(2)}
                      </td>

                      {/* Cashier / Recorded By */}
                      <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs truncate max-w-[120px]">
                        {row.recordedBy || 'System'}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {onDeleteDebtTransaction && (
                          <button
                            type="button"
                            onClick={() => setTransactionToDelete(row)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors cursor-pointer"
                            title="Tirtir Dhaqdhaqaaqa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* MANDATORY STICKY TOTAL FOOTER AT THE BOTTOM */}
            <tfoot className="sticky bottom-0 z-20 bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white font-black border-t-2 border-b-2 border-slate-400 dark:border-slate-600 text-xs shadow-lg">
              <tr className="bg-emerald-500/10 dark:bg-emerald-950/50">
                <td className="px-2 py-3 border-r border-slate-300 dark:border-slate-700 text-center font-mono text-[#107c41]">
                  Σ
                </td>
                <td colSpan={6} className="px-4 py-3 border-r border-slate-300 dark:border-slate-700 text-left font-black tracking-wider text-slate-900 dark:text-white uppercase">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-[#107c41]">Total :</span>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      (Wadarta Guud ee {totals.count} Dhaqdhaqaaq oo ku qoran faylka macmiilka)
                    </span>
                  </div>
                </td>

                {/* Total Debits */}
                <td className="px-3 py-3 border-r border-slate-300 dark:border-slate-700 text-right font-mono font-black text-sm text-red-600 dark:text-red-400 whitespace-nowrap">
                  +${totals.totalDebit.toFixed(2)}
                </td>

                {/* Total Credits */}
                <td className="px-3 py-3 border-r border-slate-300 dark:border-slate-700 text-right font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                  -${totals.totalCredit.toFixed(2)}
                </td>

                {/* Final Total Remaining Balance */}
                <td className="px-3 py-3 border-r border-slate-300 dark:border-slate-700 text-right font-mono font-black text-base text-slate-950 dark:text-white bg-amber-500/15 whitespace-nowrap underline decoration-double">
                  ${totals.currentCustomerDebt.toFixed(2)}
                </td>

                <td colSpan={2} className="px-3 py-3 text-center text-[11px] font-mono font-bold text-slate-500">
                  {totals.currentCustomerDebt > 0 ? (
                    <span className="text-red-600 font-bold">Haray: ${totals.currentCustomerDebt.toFixed(2)}</span>
                  ) : (
                    <span className="text-emerald-600 font-bold">Waa Dhameystiran</span>
                  )}
                </td>
              </tr>
            </tfoot>

          </table>
        </div>

        {/* BOTTOM EXCEL STATUS BAR */}
        <div className="bg-[#107c41] text-white px-4 py-1.5 flex items-center justify-between text-[11px] font-mono shrink-0 select-none">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 font-bold">
              <span>Diyaar (Ready)</span>
            </span>
            <div className="h-3 w-[1px] bg-white/40" />
            <span>Xariiqo (Rows): {totals.count}</span>
            <div className="h-3 w-[1px] bg-white/40" />
            <span>Wadarta Deyn Cusub: ${totals.totalDebit.toFixed(2)}</span>
            <div className="h-3 w-[1px] bg-white/40" />
            <span>Wadarta La Bixiyay: ${totals.totalCredit.toFixed(2)}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="bg-black/25 px-2 py-0.5 rounded font-black text-white">
              Total Haraaga: ${totals.currentCustomerDebt.toFixed(2)}
            </span>
            <span>100% Zoom</span>
          </div>
        </div>

      </div>

      {/* MODAL: QUICK RECORD PAYMENT (Inside Excel Statement) */}
      {isPayModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span>Qabashada Lacag Deyn ah</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickPaySubmit} className="space-y-3.5">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500 block">Macmiilka:</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{customer.name}</span>
                <span className="text-xs font-mono font-bold text-red-600 block mt-1">
                  Deynta Ku Maqan: ${currentOutstandingDebt.toFixed(2)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lacagta La Qabanayo ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-base font-mono font-black text-emerald-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Faahfaahin / Xusuus
                </label>
                <input
                  type="text"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="tusaale: Lacag caddaan ah..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="flex-1 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Ka Noqo
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Xaqiiji Lacagta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: QUICK ADD DEBT WITH ITEM NAME AND CATEGORY */}
      {isChargeModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-600" />
                <span>Ku Dar Deyn Cusub & Qor Xogta Alaabta</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsChargeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickChargeSubmit} className="space-y-3.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500 block">Macmiilka:</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{customer.name}</span>
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400 block mt-1">
                  Xadka Deynta: ${(customer.creditLimit || 250).toFixed(2)} | Hadda Maqan: ${currentOutstandingDebt.toFixed(2)}
                </span>
              </div>

              {/* Quick Preset Products (Timir, Bariis, Sonkor, etc.) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Doorasho Degdeg ah (Quick Items):
                </label>
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {[
                    { name: 'Timir (Dates) 1kg', category: 'Cunto (Food)', price: 4.50 },
                    { name: 'Timir Macaan 500g', category: 'Cunto (Food)', price: 2.75 },
                    { name: 'Bariis Basmati 25kg', category: 'Cunto (Food)', price: 24.00 },
                    { name: 'Sonkor Macaan 50kg', category: 'Cunto (Food)', price: 38.00 },
                    { name: 'Saliid Cunto 5L', category: 'Cunto (Food)', price: 8.50 },
                    { name: 'Caano Nido 2.5kg', category: 'Cunto (Food)', price: 18.00 },
                    { name: 'Shaah Kayser 500g', category: 'Cabitaan (Drinks)', price: 3.50 }
                  ].map(preset => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setActionItemName(preset.name);
                        setActionItemCategory(preset.category);
                        const qty = parseInt(actionItemQty) || 1;
                        setActionAmount((preset.price * qty).toFixed(2));
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
                        actionItemName === preset.name
                          ? 'bg-amber-600 text-white border-amber-500 shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {preset.name.includes('Timir') ? '🌴 ' : ''}{preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Store Products Dropdown if available */}
              {products && products.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                    Ama Ka Dooro Kaydka Dukaanka:
                  </label>
                  <select
                    onChange={(e) => {
                      const selProd = products.find(p => p.id === e.target.value);
                      if (selProd) {
                        setActionItemName(selProd.name);
                        setActionItemCategory(selProd.category || 'Guud');
                        const qty = parseInt(actionItemQty) || 1;
                        setActionAmount((selProd.retailPrice * qty).toFixed(2));
                      }
                    }}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                  >
                    <option value="">-- Dooro alaab ka mid ah kaydka --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} - ${p.retailPrice.toFixed(2)} ({p.category || 'Guud'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Product Name (Magaca Alaabta) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Magaca Alaabta *
                </label>
                <input
                  type="text"
                  required
                  value={actionItemName}
                  onChange={(e) => setActionItemName(e.target.value)}
                  placeholder="tusaale: Timir, Bariis 25kg, Sonkor..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Product Category / Type & Quantity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nuuca Alaabta *
                  </label>
                  <input
                    type="text"
                    required
                    value={actionItemCategory}
                    onChange={(e) => setActionItemCategory(e.target.value)}
                    placeholder="tusaale: Cunto, Cabitaan, Qalab..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tirada *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={actionItemQty}
                    onChange={(e) => setActionItemQty(e.target.value)}
                    placeholder="1"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Debt Amount ($) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Qadarka Deynta Cusub ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-base font-mono font-black text-amber-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Additional notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Faahfaahin Dheeraad ah
                </label>
                <input
                  type="text"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="Xusuus ku saabsan bixinta ama heshiiska..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsChargeModalOpen(false)}
                  className="flex-1 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Ka Noqo
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Xaqiiji Deynta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: DELETE SPECIFIC DEBT TRANSACTION AND UPDATE/CLEAR BALANCE */}
      {transactionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs" dir="ltr">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1.5">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                Ma hubtaa inaad tirtirto deyntan?
              </h4>
              <p className="text-xs text-slate-500">
                Waxaad tirtiraysaa: <span className="font-bold text-slate-800 dark:text-slate-200">{transactionToDelete.productName || transactionToDelete.notes || 'Deyn'}</span>
              </p>
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300">
                <div className="flex justify-between items-center mb-1">
                  <span>Qadarka Deynta:</span>
                  <span className="font-mono font-black text-sm text-red-600 dark:text-red-400">
                    ${(transactionToDelete.amount || 0).toFixed(2)}
                  </span>
                </div>
                <div className="text-[11px] text-red-600 dark:text-red-400 font-semibold text-left">
                  ✓ Qadarkan si toos ah ayaa looga goynayaa oo loo masaxayaa haraaga deynta macmiilka!
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTransactionToDelete(null)}
                className="flex-1 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Ka Noqo
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteDebtTransaction) {
                    onDeleteDebtTransaction(transactionToDelete.id, customer.id);
                  }
                  setTransactionToDelete(null);
                }}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                Haa, Tirtir & Masax
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: CLEAR ALL DEBT HISTORY FOR THIS CUSTOMER */}
      {isClearAllConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs" dir="ltr">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1.5">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                Ma hubtaa inaad tirtirto dhammaan taariikhda deynta?
              </h4>
              <p className="text-xs text-slate-500">
                Macmiilka: <span className="font-bold text-slate-800 dark:text-slate-200">{customer.name}</span>
              </p>
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300">
                <p className="font-semibold text-left">
                  Dhammaan {totals.count} dhaqdhaqaaq ee deynta macmiilkan waa la masaxayaa, haraaga xisaabtiisuna wuxuu noqonayaa <strong>$0.00</strong>.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsClearAllConfirmOpen(false)}
                className="flex-1 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Ka Noqo
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onClearCustomerDebts) {
                    onClearCustomerDebts(customer.id);
                  }
                  setIsClearAllConfirmOpen(false);
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                Haa, Tirtir Dhammaan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIRECT IN-CUSTOMER POS TERMINAL MODAL */}
      {isPOSOpen && (
        <CustomerPOSModal
          isOpen={isPOSOpen}
          onClose={() => setIsPOSOpen(false)}
          customer={customer}
          products={products}
          inventory={inventory}
          currentUser={currentUser}
          onAddInvoice={(items, method, total, cost, custId, custName, isCredit) => {
            onAddInvoice?.(items, method, total, cost, custId, custName, isCredit);
          }}
          onAddDebtTransaction={onAddDebtTransaction}
          onAddAuditLog={onAddAuditLog || (() => {})}
          enterprise={enterprise}
        />
      )}

      {/* PRINT-SPECIFIC CSS FOR CLEAN STATEMENT PRINTING */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .fixed.inset-0.z-50, .fixed.inset-0.z-50 * {
            visibility: visible;
          }
          .fixed.inset-0.z-50 {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            background: white !important;
            color: black !important;
          }
          button, input, select, .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
