/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Customer, DebtTransaction, Invoice, User, Product, InventoryItem, InvoiceItem, PaymentMethod } from '../types';
import {
  Users,
  Search,
  Plus,
  DollarSign,
  CreditCard,
  Receipt,
  FileText,
  FileSpreadsheet,
  Trash2,
  Edit2,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  CheckCircle2,
  Phone,
  MapPin,
  AlertTriangle,
  Download,
  Printer,
  History,
  TrendingDown,
  ShieldCheck,
  UserCheck,
  ShoppingCart
} from 'lucide-react';
import { CustomerStatementExcelView } from './CustomerStatementExcelView';
import { CustomerPOSModal } from './CustomerPOSModal';

interface CustomersDebtsManagerProps {
  customers: Customer[];
  debtTransactions: DebtTransaction[];
  invoices?: Invoice[];
  currentUser: User;
  onAddCustomer: (
    customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>,
    initialDebt?: number,
    initialDebtItemName?: string,
    initialDebtItemCategory?: string
  ) => void;
  onUpdateCustomer: (id: string, updates: Partial<Customer>) => void;
  onDeleteCustomer: (id: string) => void;
  onRecordDebtPayment: (customerId: string, amount: number, notes: string) => void;
  onAddManualDebt: (
    customerId: string,
    amount: number,
    notes: string,
    itemName?: string,
    itemCategory?: string,
    itemQuantity?: number
  ) => void;
  onAddAuditLog: (action: string, details: string, type: 'info' | 'warning' | 'error' | 'success') => void;
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
  enterprise?: any;
}

export function CustomersDebtsManager({
  customers,
  debtTransactions,
  invoices = [],
  currentUser,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onRecordDebtPayment,
  onAddManualDebt,
  onAddAuditLog,
  onDeleteDebtTransaction,
  onClearCustomerDebts,
  products = [],
  inventory = [],
  onAddInvoice,
  onAddDebtTransaction,
  enterprise
}: CustomersDebtsManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'with_debt' | 'settled'>('all');

  // Modals state
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null);
  const [chargingCustomer, setChargingCustomer] = useState<Customer | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [selectedExcelCustomer, setSelectedExcelCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [posCustomer, setPosCustomer] = useState<Customer | null>(null);

  // Form states - Add/Edit
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCreditLimit, setFormCreditLimit] = useState('200');
  const [formInitialDebt, setFormInitialDebt] = useState('0');
  const [formInitialDebtItemName, setFormInitialDebtItemName] = useState('');
  const [formInitialDebtItemCategory, setFormInitialDebtItemCategory] = useState('Guud / General');
  const [formNotes, setFormNotes] = useState('');

  // Payment Form state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('Cash Payment');

  // Charge / Add Debt Form state
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeNote, setChargeNote] = useState('Store purchase credit');
  const [chargeItemName, setChargeItemName] = useState('');
  const [chargeItemCategory, setChargeItemCategory] = useState('Cunto & Cabitaan');
  const [chargeItemQty, setChargeItemQty] = useState('1');

  // Calculate high-level KPIs
  const totalOutstandingDebt = customers.reduce((sum, c) => sum + (c.totalDebt || 0), 0);
  const customersWithDebtCount = customers.filter(c => (c.totalDebt || 0) > 0).length;
  const totalCollectedDebt = debtTransactions
    .filter(t => t.type === 'payment_received')
    .reduce((sum, t) => sum + t.amount, 0);

  // Filter customers
  const filteredCustomers = customers.filter(c => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.address && c.address.toLowerCase().includes(q)) ||
      (c.notes && c.notes.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (filterMode === 'with_debt') {
      return (c.totalDebt || 0) > 0;
    }
    if (filterMode === 'settled') {
      return (c.totalDebt || 0) <= 0;
    }
    return true;
  });

  const handleOpenAddModal = () => {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormCreditLimit('250');
    setFormInitialDebt('0');
    setFormInitialDebtItemName('');
    setFormInitialDebtItemCategory('Guud / General');
    setFormNotes('');
    setIsAddCustomerOpen(true);
  };

  const handleOpenEditModal = (cust: Customer) => {
    setEditingCustomer(cust);
    setFormName(cust.name);
    setFormPhone(cust.phone);
    setFormEmail(cust.email || '');
    setFormAddress(cust.address || '');
    setFormCreditLimit(cust.creditLimit?.toString() || '250');
    setFormNotes(cust.notes || '');
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      return;
    }

    if (editingCustomer) {
      onUpdateCustomer(editingCustomer.id, {
        name: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim() || undefined,
        address: formAddress.trim() || undefined,
        creditLimit: parseFloat(formCreditLimit) || 250,
        notes: formNotes.trim() || undefined,
        updatedAt: new Date().toISOString()
      });
      onAddAuditLog('Wax Ka Beddelka Macmiilka', `Waxaa la cusbooneysiiyay xogta macmiilka "${formName}".`, 'info');
      setEditingCustomer(null);
    } else {
      const initialDebtNum = parseFloat(formInitialDebt) || 0;
      onAddCustomer(
        {
          name: formName.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim() || undefined,
          address: formAddress.trim() || undefined,
          totalDebt: initialDebtNum,
          creditLimit: parseFloat(formCreditLimit) || 250,
          notes: formNotes.trim() || undefined
        },
        initialDebtNum,
        initialDebtNum > 0 ? (formInitialDebtItemName.trim() || 'Deyn Hore (Previous Debt)') : undefined,
        initialDebtNum > 0 ? formInitialDebtItemCategory : undefined
      );
      onAddAuditLog('Diiwaangelinta Macmiil Cusub', `Waxaa la diiwaangeliyay macmiilka cusub "${formName}" oo leh deyn hore $${initialDebtNum.toFixed(2)}.`, 'success');
      setIsAddCustomerOpen(false);
    }
  };

  const handleProcessPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingCustomer) return;
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) return;

    onRecordDebtPayment(payingCustomer.id, amt, paymentNote.trim() || 'Gudista Deynta (Cash Payment)');
    onAddAuditLog('Lacag Deyn ah oo La Qabtay', `Waxaa laga qabtay $${amt.toFixed(2)} macmiilka ${payingCustomer.name}.`, 'success');
    setPayingCustomer(null);
    setPaymentAmount('');
  };

  const handleProcessCharge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chargingCustomer) return;
    const amt = parseFloat(chargeAmount);
    if (isNaN(amt) || amt <= 0) return;

    const qty = parseFloat(chargeItemQty) || 1;
    onAddManualDebt(
      chargingCustomer.id,
      amt,
      chargeNote.trim() || 'Deyn iib dukaanka ah',
      chargeItemName.trim() || 'Alaab Deyn ah (Goods on Credit)',
      chargeItemCategory.trim() || 'Cunto & Cabitaan',
      qty
    );
    onAddAuditLog('Deyn Lagu Qoray Macmiilka', `Waxaa deyn ah $${amt.toFixed(2)} lagu qoray ${chargingCustomer.name} (${chargeItemName.trim() || 'Alaab'}).`, 'warning');
    setChargingCustomer(null);
    setChargeAmount('');
    setChargeItemName('');
    setChargeItemCategory('Cunto & Cabitaan');
    setChargeItemQty('1');
  };

  const handleExportCSV = () => {
    let csv = 'Customer Name,Phone,Address,Outstanding Debt,Credit Limit,Available Credit,Notes,Created Date\n';
    customers.forEach(c => {
      const limit = c.creditLimit || 250;
      const available = Math.max(0, limit - (c.totalDebt || 0));
      csv += `"${c.name}","${c.phone}","${c.address || ''}",${(c.totalDebt || 0).toFixed(2)},${limit.toFixed(2)},${available.toFixed(2)},"${c.notes || ''}","${c.createdAt}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `customer_debts_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 dark:bg-slate-900 overflow-hidden text-slate-900 dark:text-slate-100 font-sans">
      
      {/* TOP HEADER & ACTION BAR */}
      <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold font-display tracking-tight text-slate-900 dark:text-white">
              Macaamiisha & Deymaha
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Macmiil Cusub</span>
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="px-6 py-3 grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        
        {/* Total Debt */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Deymaha Maqan
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white font-mono block mt-0.5">
              ${totalOutstandingDebt.toFixed(2)}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        {/* Debtors Count */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Deynlayaasha
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white font-mono block mt-0.5">
              {customersWithDebtCount}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>

        {/* Total Customers */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Macaamiisha
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white font-mono block mt-0.5">
              {customers.length}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
        </div>

        {/* Total Collected */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Lacagta La Qabtay
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white font-mono block mt-0.5">
              ${totalCollectedDebt.toFixed(2)}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>

      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
        
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              filterMode === 'all'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Dhammaan Macaamiisha ({customers.length})
          </button>
          <button
            onClick={() => setFilterMode('with_debt')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              filterMode === 'with_debt'
                ? 'bg-red-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Deynlayaasha ({customersWithDebtCount})
          </button>
          <button
            onClick={() => setFilterMode('settled')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              filterMode === 'settled'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Bilaash / Deymo La'aan ({customers.length - customersWithDebtCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Raadi magaca macmiilka ama telefoonka..."
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-500 shadow-sm text-slate-900 dark:text-slate-100"
          />
        </div>

      </div>

      {/* CUSTOMERS & DEBTS DATA TABLE */}
      <div className="flex-1 px-6 pb-6 overflow-hidden min-h-0">
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl h-full flex flex-col shadow-sm overflow-hidden">
          
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900/80 sticky top-0 border-b border-slate-200 dark:border-slate-800 z-10 font-bold text-slate-700 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Macmiilka & Xogtiisa</th>
                  <th className="px-4 py-3">Taariikhda (Excel Sheet)</th>
                  <th className="px-4 py-3">Telefoonka & Goobta</th>
                  <th className="px-4 py-3 text-right">Deynta Maqan</th>
                  <th className="px-4 py-3 text-right">Xadka Deynta</th>
                  <th className="px-4 py-3 text-right">Deynta u Bannaan</th>
                  <th className="px-4 py-3 text-center">Xaaladda</th>
                  <th className="px-4 py-3 text-right">Ficilada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-slate-400">
                      <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-semibold">Lama helin macmiil</p>
                      <p className="text-xs text-slate-500 mt-1">Fadlan raadi magac kale ama guji "Diiwaangeli Macmiil Cusub" kor.</p>
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => {
                    const debt = cust.totalDebt || 0;
                    const limit = cust.creditLimit || 250;
                    const available = Math.max(0, limit - debt);
                    const isOverLimit = debt > limit;

                    return (
                      <tr
                        key={cust.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                      >
                        {/* Name & Notes */}
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => setSelectedExcelCustomer(cust)}
                            className="text-left group cursor-pointer"
                            title="Guji si aad u furto Xaashida Excel ee Macmiilkan"
                          >
                            <div className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                              <span>{cust.name}</span>
                              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            {cust.notes && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                                {cust.notes}
                              </div>
                            )}
                          </button>
                        </td>

                        {/* Clickable Date -> Full Excel Sheet */}
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            onClick={() => setSelectedExcelCustomer(cust)}
                            className="group/excel inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300 transition-all cursor-pointer shadow-xs"
                            title="Guji taariikhda si aad u furto Xaashida Excel & Kalkaaliyaha Dhaqdhaqaaqa"
                          >
                            <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover/excel:scale-105 transition-transform">
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                            </div>
                            <div className="text-left font-mono">
                              <span className="text-xs font-black block leading-tight">
                                {new Date(cust.updatedAt || cust.createdAt || Date.now()).toLocaleDateString()}
                              </span>
                              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold block leading-tight">
                                Xaashida Excel ↗
                              </span>
                            </div>
                          </button>
                        </td>

                        {/* Phone & Address */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 font-mono text-slate-700 dark:text-slate-300">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{cust.phone}</span>
                          </div>
                          {cust.address && (
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[180px]">{cust.address}</span>
                            </div>
                          )}
                        </td>

                        {/* Outstanding Debt */}
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-sm">
                          {debt > 0 ? (
                            <span className="text-red-600 dark:text-red-400">
                              ${debt.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              $0.00
                            </span>
                          )}
                        </td>

                        {/* Credit Limit */}
                        <td className="px-4 py-3.5 text-right font-mono text-slate-600 dark:text-slate-400">
                          ${limit.toFixed(2)}
                        </td>

                        {/* Available Credit */}
                        <td className="px-4 py-3.5 text-right font-mono">
                          <span className={isOverLimit ? 'text-red-500 font-bold' : 'text-slate-700 dark:text-slate-300 font-medium'}>
                            ${available.toFixed(2)}
                          </span>
                        </td>

                        {/* Status Badge */}
                        <td className="px-4 py-3.5 text-center">
                          {isOverLimit ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                              Ka Batay Xadka
                            </span>
                          ) : debt > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                              Deyn Leh
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                              Deyn Ma Leh
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            
                            {/* Direct In-Customer POS Terminal */}
                            <button
                              type="button"
                              onClick={() => setPosCustomer(cust)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[11px] flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                              title="Toos uga iibi macmiilkan adigoon aadin Main POS (Direct Customer POS)"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              <span>POS</span>
                            </button>

                            {/* Pay Debt Button */}
                            {debt > 0 && (
                              <button
                                onClick={() => {
                                  setPayingCustomer(cust);
                                  setPaymentAmount(debt.toFixed(2));
                                  setPaymentNote('Gudidda deynta');
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                                title="Qabo Lacagta Deynta"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>Gud Deyn</span>
                              </button>
                            )}

                            {/* Charge / Add Debt Button */}
                            <button
                              onClick={() => {
                                setChargingCustomer(cust);
                                setChargeAmount('');
                                setChargeNote('Alaab deyn lagu qaatay');
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                              title="Deyn gacanta ah ku dar"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Deyn Ku Dar</span>
                            </button>

                            {/* Excel Statement Button */}
                            <button
                              onClick={() => setSelectedExcelCustomer(cust)}
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors cursor-pointer"
                              title="Fur Xaashida Excel (Customer Statement)"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                            </button>

                            {/* History / Statement Modal */}
                            <button
                              onClick={() => setStatementCustomer(cust)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Eeg Warbixinta Macmiilka"
                            >
                              <History className="w-4 h-4" />
                            </button>

                            {/* Edit */}
                            <button
                              onClick={() => handleOpenEditModal(cust)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Wax ka beddel Macmiilka"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete */}
                            <button
                              type="button"
                              onClick={() => setCustomerToDelete(cust)}
                              className="p-1.5 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                              title="Tirtir Macmiilka"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Muujinaya {filteredCustomers.length} ka mid ah {customers.length} xisaabaadka macaamiisha</span>
            <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
              Wadarta Deynta: ${totalOutstandingDebt.toFixed(2)}
            </span>
          </div>

        </div>
      </div>

      {/* MODAL: ADD / EDIT CUSTOMER */}
      {(isAddCustomerOpen || editingCustomer) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            
            <div className="bg-slate-50 dark:bg-slate-900 px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>{editingCustomer ? 'Wax ka Beddel Macmiilka' : 'Diiwaangeli Macmiil Cusub'}</span>
              </h3>
              <button
                onClick={() => {
                  setIsAddCustomerOpen(false);
                  setEditingCustomer(null);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Magaca Macmiilka oo Buuxa *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="tusaale: Axmed Cali"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lambarka Telefoonka *
                </label>
                <input
                  type="text"
                  required
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="tusaale: +252 61 5123456"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Xadka Deynta ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formCreditLimit}
                    onChange={(e) => setFormCreditLimit(e.target.value)}
                    placeholder="250.00"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>

                {!editingCustomer && (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Deynta Hore / Bilowga ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formInitialDebt}
                      onChange={(e) => setFormInitialDebt(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                )}
              </div>

              {!editingCustomer && parseFloat(formInitialDebt) > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl space-y-2.5">
                  <span className="block font-bold text-amber-800 dark:text-amber-300 text-[11px]">
                    Xogta Alaabta Deynta Hore
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Magaca Alaabta
                      </label>
                      <input
                        type="text"
                        value={formInitialDebtItemName}
                        onChange={(e) => setFormInitialDebtItemName(e.target.value)}
                        placeholder="tusaale: Sonkor 50kg, Bariis, Caano..."
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Nuuca Alaabta
                      </label>
                      <input
                        type="text"
                        value={formInitialDebtItemCategory}
                        onChange={(e) => setFormInitialDebtItemCategory(e.target.value)}
                        placeholder="tusaale: Cunto, Cabitaan, Qalab..."
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Cinwaanka / Degmada (Ikhtiyaari)
                </label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="tusaale: Degmada Hodan, Suuq Bacaad"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Faahfaahin & Shuruudo (Ikhtiyaari)
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="tusaale: Macmiil joogto ah, wuxuu bixiyaa Jimco kasta..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-medium resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddCustomerOpen(false);
                    setEditingCustomer(null);
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-xl cursor-pointer"
                >
                  Ka noqo
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-sm cursor-pointer"
                >
                  {editingCustomer ? 'Cusboonaysii' : 'Kaydi Macmiilka'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* MODAL: RECEIVE PAYMENT / SETTLE DEBT */}
      {payingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            
            <div className="bg-emerald-50 dark:bg-emerald-950/40 px-5 py-4 border-b border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between">
              <h3 className="font-bold text-sm text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                <span>Qabashada Lacagta Deynta</span>
              </h3>
              <button
                onClick={() => setPayingCustomer(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProcessPayment} className="p-5 space-y-4 text-xs">
              
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-500 dark:text-slate-400">Macmiilka:</span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">{payingCustomer.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Deynta Maqan ee Hadda:</span>
                  <span className="font-mono font-bold text-red-600 dark:text-red-400 text-base">
                    ${(payingCustomer.totalDebt || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Qadarka Lacagta La Bixinayo ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono font-bold text-base focus:outline-none focus:border-emerald-500"
                />

                {/* Quick amount shortcuts */}
                <div className="flex gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setPaymentAmount((payingCustomer.totalDebt || 0).toFixed(2))}
                    className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-[11px] font-bold cursor-pointer"
                  >
                    Dhammaan Deynta (${(payingCustomer.totalDebt || 0).toFixed(2)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(((payingCustomer.totalDebt || 0) / 2).toFixed(2))}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-semibold cursor-pointer"
                  >
                    50% Deynta
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Xusuusin / Nooca Lacagta (Kaash, Zaad, EVC)
                </label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="tusaale: Lacag kaash ah oo la qabtay, Zaad, EVC..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayingCustomer(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-xl cursor-pointer"
                >
                  Ka noqo
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Xaqiiji Lacagta</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* MODAL: CHARGE MANUAL DEBT */}
      {chargingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            
            <div className="bg-amber-50 dark:bg-amber-950/40 px-5 py-4 border-b border-amber-200 dark:border-amber-900/40 flex items-center justify-between">
              <h3 className="font-bold text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <Plus className="w-5 h-5" />
                <span>Deyn Ku Dar Macmiilka</span>
              </h3>
              <button
                onClick={() => setChargingCustomer(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleProcessCharge} className="p-5 space-y-4 text-xs">
              
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-500 dark:text-slate-400">Macmiilka:</span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">{chargingCustomer.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Deynta Hadda:</span>
                  <span className="font-mono font-bold text-red-600 dark:text-red-400">
                    ${(chargingCustomer.totalDebt || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-500 mt-0.5">
                  <span>Xadka Deynta:</span>
                  <span className="font-mono">${(chargingCustomer.creditLimit || 250).toFixed(2)}</span>
                </div>
              </div>

              {/* Item Info: Name, Category, Quantity */}
              <div className="space-y-3 p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-xl">
                <div>
                  <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1">
                    Magaca Alaabta *
                  </label>
                  <input
                    type="text"
                    required
                    value={chargeItemName}
                    onChange={(e) => setChargeItemName(e.target.value)}
                    placeholder="tusaale: Sonkor 50kg, Saliid 5L, Caano..."
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 text-[11px]">
                      Nuuca Alaabta
                    </label>
                    <input
                      type="text"
                      value={chargeItemCategory}
                      onChange={(e) => setChargeItemCategory(e.target.value)}
                      placeholder="Cunto & Cabitaan"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 font-medium text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 text-[11px]">
                      Tirada
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={chargeItemQty}
                      onChange={(e) => setChargeItemQty(e.target.value)}
                      placeholder="1"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 font-mono text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Wadarta Lacagta Deynta ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-mono font-bold text-base focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Sababta / Faahfaahin Dheeraad ah (Ikhtiyaari)
                </label>
                <input
                  type="text"
                  value={chargeNote}
                  onChange={(e) => setChargeNote(e.target.value)}
                  placeholder="tusaale: Heshiis bixineed, qofka qaatay..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 font-medium"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setChargingCustomer(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-xl cursor-pointer"
                >
                  Ka noqo
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Deyn Ku Dar</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* MODAL: CUSTOMER STATEMENT / LEDGER HISTORY */}
      {statementCustomer && (() => {
        const liveStatementCust = customers.find(c => c.id === statementCustomer.id) || statementCustomer;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
            
            {/* Statement Header */}
            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Warbixinta Xisaabta & Deynta Macmiilka (Statement)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {liveStatementCust.name} • {liveStatementCust.phone}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                  title="Daabac Warbixinta"
                >
                  <Printer className="w-4 h-4" />
                  <span>Daabac</span>
                </button>
                <button
                  onClick={() => setStatementCustomer(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Customer Summary Bar */}
            <div className="px-6 py-3.5 bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-4 text-xs font-mono">
              <div>
                <span className="text-slate-500 dark:text-slate-400 text-[10px] block">Deynta Hadda:</span>
                <span className="font-bold text-red-600 dark:text-red-400 text-sm">
                  ${(liveStatementCust.totalDebt || 0).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 text-[10px] block">Xadka Deynta:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  ${(liveStatementCust.creditLimit || 250).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 text-[10px] block">Lacagta u Bannaan:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                  ${Math.max(0, (liveStatementCust.creditLimit || 250) - (liveStatementCust.totalDebt || 0)).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Ledger Transactions List */}
            <div className="p-6 flex-1 overflow-y-auto">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                Taariikhda Dhaqdhaqaaqa Deynta
              </h4>

              {debtTransactions.filter(t => t.customerId === statementCustomer.id).length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  Lama hayo wax dhaqdhaqaaq deyn ah oo ku saabsan macmiilkan weli.
                </div>
              ) : (
                <div className="space-y-2">
                  {debtTransactions
                    .filter(t => t.customerId === statementCustomer.id)
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .map((t) => {
                      const isPayment = t.type === 'payment_received';
                      return (
                        <div
                          key={t.id}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${isPayment ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'}`}>
                              {isPayment ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span>{isPayment ? 'Gudis Lacageed oo La Qabtay' : 'Deyn Cusub / Iib Dayn ah'}</span>
                                {t.invoiceNumber && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-mono">
                                    {t.invoiceNumber}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {new Date(t.timestamp).toLocaleDateString()} {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Diiwaangeliyay: {t.recordedBy}
                              </div>
                              {t.itemName && (
                                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 mt-1 flex items-center gap-1.5 flex-wrap">
                                  <span className="text-amber-600 dark:text-amber-400">📦 {t.itemName}</span>
                                  {t.itemCategory && (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400">
                                      Nuuca: {t.itemCategory}
                                    </span>
                                  )}
                                  {t.itemQuantity && (
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      (Tirada: {t.itemQuantity})
                                    </span>
                                  )}
                                </div>
                              )}
                              {t.notes && (
                                <div className="text-[11px] text-slate-600 dark:text-slate-400 italic mt-0.5">
                                  "{t.notes}"
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right font-mono">
                              <span className={`block font-bold text-sm ${isPayment ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                {isPayment ? `-$${t.amount.toFixed(2)}` : `+$${t.amount.toFixed(2)}`}
                              </span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                Haraaga: ${t.balanceAfter.toFixed(2)}
                              </span>
                            </div>

                            {onDeleteDebtTransaction && (
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteDebtTransaction(t.id, statementCustomer.id);
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer transition-colors"
                                title="Tirtir Dhaqdhaqaaqa"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setStatementCustomer(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Xir Warbixinta
              </button>
            </div>

          </div>
        </div>
        );
      })()}

      {/* IN-APP CUSTOMER DELETION CONFIRMATION MODAL */}
      {customerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs" dir="ltr">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Tirtiridda Macmiilka
              </h3>
              <p className="text-xs text-slate-500">
                Ma hubtaa inaad tirtirto macmiilka <span className="font-bold text-slate-800 dark:text-slate-200">"{customerToDelete.name}"</span>?
              </p>
              {customerToDelete.phone && (
                <span className="text-[11px] font-mono text-slate-400 block">
                  Tel: {customerToDelete.phone}
                </span>
              )}
              {(customerToDelete.totalDebt || 0) > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                  Digniin: Macmiilkan waxaa ku maqan deyn dhan ${(customerToDelete.totalDebt || 0).toFixed(2)}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCustomerToDelete(null)}
                className="flex-1 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Ka Noqo
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = customerToDelete.id;
                  const name = customerToDelete.name;
                  onDeleteCustomer(id);
                  onAddAuditLog('Tirtiray Macmiil', `Macmiilka "${name}" waa la tirtiray.`, 'warning');
                  setCustomerToDelete(null);
                }}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                Haa, Tirtir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DEDICATED FULL-PAGE EXCEL CUSTOMER STATEMENT */}
      {selectedExcelCustomer && (() => {
        const liveExcelCust = customers.find(c => c.id === selectedExcelCustomer.id) || selectedExcelCustomer;
        return (
          <CustomerStatementExcelView
            customer={liveExcelCust}
            debtTransactions={debtTransactions}
            invoices={invoices}
            currentUser={currentUser}
            products={products}
            inventory={inventory}
            enterprise={enterprise}
            onAddInvoice={onAddInvoice}
            onAddDebtTransaction={onAddDebtTransaction}
            onAddAuditLog={onAddAuditLog}
            onClose={() => setSelectedExcelCustomer(null)}
            onRecordDebtPayment={(customerId, amt, notes) => {
              onRecordDebtPayment(customerId, amt, notes);
            }}
            onAddManualDebt={(customerId, amt, notes, itemName, itemCategory, itemQuantity) => {
              onAddManualDebt(customerId, amt, notes, itemName, itemCategory, itemQuantity);
            }}
            onDeleteDebtTransaction={onDeleteDebtTransaction}
            onClearCustomerDebts={onClearCustomerDebts}
          />
        );
      })()}

      {/* DIRECT IN-CUSTOMER POS TERMINAL MODAL */}
      {posCustomer && (
        <CustomerPOSModal
          isOpen={Boolean(posCustomer)}
          onClose={() => setPosCustomer(null)}
          customer={customers.find(c => c.id === posCustomer.id) || posCustomer}
          products={products}
          inventory={inventory}
          currentUser={currentUser}
          onAddInvoice={onAddInvoice || (() => {})}
          onAddDebtTransaction={onAddDebtTransaction}
          onAddAuditLog={onAddAuditLog}
          enterprise={enterprise}
        />
      )}

    </div>
  );
}
