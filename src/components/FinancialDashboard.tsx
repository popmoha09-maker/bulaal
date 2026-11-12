import React, { useState, useMemo } from 'react';
import { Invoice, AuditLog, Product, InventoryItem, Customer } from '../types';
import { 
  TrendingUp, DollarSign, Percent, AlertCircle, 
  BarChart2, PieChart, CheckCircle2,
  Calendar, Download, Users, ShoppingBag, ShieldCheck, ArrowUpRight
} from 'lucide-react';

interface FinancialDashboardProps {
  invoices: Invoice[];
  auditLogs: AuditLog[];
  products: Product[];
  inventory: InventoryItem[];
  customers?: Customer[];
  theme?: 'light' | 'dark';
}

type DateRangeOption = 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'this_month' | 'all_time';

export function FinancialDashboard({
  invoices,
  auditLogs,
  products,
  inventory,
  customers = [],
  theme = 'dark'
}: FinancialDashboardProps) {
  const [dateRange, setDateRange] = useState<DateRangeOption>('today');
  const [dashboardTab, setDashboardTab] = useState<'revenues' | 'inventory_value' | 'top_products' | 'debts'>('revenues');

  // Active non-voided invoices
  const activeInvoices = useMemo(() => {
    return invoices.filter((i) => i.totalAmount > 0);
  }, [invoices]);

  // Filter invoices by selected date range
  const filteredInvoices = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return activeInvoices.filter((inv) => {
      const invDate = new Date(inv.timestamp);

      if (dateRange === 'today') {
        return invDate >= todayStart;
      } else if (dateRange === 'yesterday') {
        const yestStart = new Date(todayStart);
        yestStart.setDate(yestStart.getDate() - 1);
        return invDate >= yestStart && invDate < todayStart;
      } else if (dateRange === 'last_7_days') {
        const d7 = new Date(todayStart);
        d7.setDate(d7.getDate() - 7);
        return invDate >= d7;
      } else if (dateRange === 'last_30_days') {
        const d30 = new Date(todayStart);
        d30.setDate(d30.getDate() - 30);
        return invDate >= d30;
      } else if (dateRange === 'this_month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return invDate >= monthStart;
      }
      return true; // 'all_time'
    });
  }, [activeInvoices, dateRange]);

  // Real Calculated Metrics (NO VAT)
  const totalRevenues = useMemo(() => {
    return filteredInvoices.reduce((acc, i) => acc + i.totalAmount, 0);
  }, [filteredInvoices]);

  const totalCost = useMemo(() => {
    return filteredInvoices.reduce((acc, i) => acc + i.totalCost, 0);
  }, [filteredInvoices]);

  const grossProfit = totalRevenues - totalCost;
  const grossMarginPercent = totalRevenues > 0 ? (grossProfit / totalRevenues) * 100 : 0;
  const totalInvoicesCount = filteredInvoices.length;

  const totalItemsSold = useMemo(() => {
    return filteredInvoices.reduce((acc, inv) => {
      return acc + inv.items.reduce((sum, item) => sum + item.quantity, 0);
    }, 0);
  }, [filteredInvoices]);

  // Total Outstanding Debt across customers
  const totalOutstandingDebt = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.totalDebt || 0), 0);
  }, [customers]);

  // Cash vs Debt breakdown
  const cashSalesTotal = useMemo(() => {
    return filteredInvoices.filter(i => !i.isCreditSale).reduce((sum, i) => sum + i.totalAmount, 0);
  }, [filteredInvoices]);

  const creditSalesTotal = useMemo(() => {
    return filteredInvoices.filter(i => i.isCreditSale).reduce((sum, i) => sum + i.totalAmount, 0);
  }, [filteredInvoices]);

  // Inventory Asset Value
  const totalInventoryAssetValue = useMemo(() => {
    return inventory.reduce((acc, item) => {
      const prod = products.find((p) => p.id === item.productId);
      const cost = prod ? prod.costPrice : 0;
      return acc + (cost * item.quantityOnHand);
    }, 0);
  }, [inventory, products]);

  const totalInventoryRetailValue = useMemo(() => {
    return inventory.reduce((acc, item) => {
      const prod = products.find((p) => p.id === item.productId);
      const retail = prod ? prod.retailPrice : 0;
      return acc + (retail * item.quantityOnHand);
    }, 0);
  }, [inventory, products]);

  // Low stock products count
  const lowStockCount = useMemo(() => {
    return products.filter((p) => {
      const totalQty = inventory
        .filter((i) => i.productId === p.id)
        .reduce((acc, i) => acc + i.quantityOnHand, 0);
      return totalQty <= p.minStockLevel;
    }).length;
  }, [products, inventory]);

  // Top Selling Products
  const topSellingProducts = useMemo(() => {
    const map: Record<string, { name: string; quantity: number; revenue: number }> = {};
    filteredInvoices.forEach((inv) => {
      inv.items.forEach((item) => {
        if (!map[item.productId]) {
          map[item.productId] = { name: item.productName, quantity: 0, revenue: 0 };
        }
        map[item.productId].quantity += item.quantity;
        map[item.productId].revenue += item.soldPrice * item.quantity;
      });
    });
    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [filteredInvoices]);

  const exportFinancialReport = () => {
    let report = `WARBIXINTA MAALIYADDA EE BULAALE MINI MARKET\n`;
    report += `Xilliga: ${dateRange.toUpperCase()}\n`;
    report += `Taariikhda: ${new Date().toLocaleDateString('en-GB')}\n\n`;
    report += `Wadarta Iibka: $${totalRevenues.toFixed(2)}\n`;
    report += `• Iibka Caddaan ah: $${cashSalesTotal.toFixed(2)}\n`;
    report += `• Iibka Deynta ah: $${creditSalesTotal.toFixed(2)}\n`;
    report += `Kharashka Alaabta (Cost): $${totalCost.toFixed(2)}\n`;
    report += `Faa'iidada Saafiga ah: $${grossProfit.toFixed(2)}\n`;
    report += `Heerka Faa'iidada: ${grossMarginPercent.toFixed(1)}%\n`;
    report += `Wadarta Deymaha Maqan: $${totalOutstandingDebt.toFixed(2)}\n`;
    report += `Qiimaha Kaydka Bakhaarka: $${totalInventoryAssetValue.toFixed(2)}\n`;

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `warbixinta_maaliyadda_${dateRange}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 dark:bg-slate-900 overflow-y-auto text-slate-900 dark:text-slate-100 font-sans text-left" dir="ltr">
      
      {/* TOP HEADER */}
      <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl">
              <BarChart2 className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold font-display tracking-tight text-slate-900 dark:text-white">
              Warbixinaha Maaliyadda & Xisaabaadka
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Xisaabinta iibka guud, faa'iidada saafiga ah, deymaha maqan, iyo hantida kaydka bakhaarka
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Date Range Selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-850 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setDateRange('today')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                dateRange === 'today' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              Maanta
            </button>
            <button
              type="button"
              onClick={() => setDateRange('yesterday')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                dateRange === 'yesterday' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              Shalay
            </button>
            <button
              type="button"
              onClick={() => setDateRange('last_7_days')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                dateRange === 'last_7_days' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              7 Maalmood
            </button>
            <button
              type="button"
              onClick={() => setDateRange('this_month')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                dateRange === 'this_month' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              Bishan
            </button>
            <button
              type="button"
              onClick={() => setDateRange('all_time')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                dateRange === 'all_time' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-white'
              }`}
            >
              Dhammaan
            </button>
          </div>

          <button
            type="button"
            onClick={exportFinancialReport}
            className="px-3.5 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Soo Degso</span>
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="px-6 py-3 grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        
        {/* Total Revenues */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Wadarta Iibka
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white font-mono block mt-0.5">
              ${totalRevenues.toFixed(2)}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        {/* Net Profit */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Faa'iidada Saafiga
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white font-mono block mt-0.5">
              ${grossProfit.toFixed(2)}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>

        {/* Total Outstanding Debt */}
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
            <Users className="w-4 h-4" />
          </div>
        </div>

        {/* Inventory Value */}
        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
              Hantida Kaydka
            </span>
            <span className="text-xl font-bold text-slate-900 dark:text-white font-mono block mt-0.5">
              ${totalInventoryAssetValue.toFixed(2)}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
            <ShoppingBag className="w-4 h-4" />
          </div>
        </div>

      </div>

      {/* DETAILED LEDGERS & CHARTS */}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Section: Sales & Debts Overview (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Sales Breakdown Card */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
            <h3 className="font-bold text-base text-slate-900 dark:text-white mb-4 flex items-center justify-between">
              <span>Iibka Caddaan vs Deyn (Cash vs Credit)</span>
              <span className="text-xs font-mono text-slate-500">Iibka Guud: ${totalRevenues.toFixed(2)}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-xl">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block mb-1">
                  Lacag Caddaan ah oo La Qabtay (Cash Sales)
                </span>
                <span className="text-2xl font-black font-mono text-emerald-700 dark:text-emerald-400">
                  ${cashSalesTotal.toFixed(2)}
                </span>
                <span className="text-[10px] text-emerald-600 block mt-1">
                  {totalRevenues > 0 ? ((cashSalesTotal / totalRevenues) * 100).toFixed(1) : 0}% ee iibka guud
                </span>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-xl">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300 block mb-1">
                  Iibka Deynta ah (Credit / Postpaid Sales)
                </span>
                <span className="text-2xl font-black font-mono text-amber-700 dark:text-amber-400">
                  ${creditSalesTotal.toFixed(2)}
                </span>
                <span className="text-[10px] text-amber-600 block mt-1">
                  {totalRevenues > 0 ? ((creditSalesTotal / totalRevenues) * 100).toFixed(1) : 0}% ee iibka guud
                </span>
              </div>
            </div>
          </div>

          {/* Top Selling Items */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
            <h3 className="font-bold text-base text-slate-900 dark:text-white mb-4">
              Alaabta Ugu Iibka Badan (Top Products)
            </h3>

            {topSellingProducts.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Wax iib ah weli laguma samayn xilligan la doortay.
              </div>
            ) : (
              <div className="space-y-3">
                {topSellingProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-slate-800 text-blue-700 dark:text-blue-400 flex items-center justify-center font-bold text-[11px]">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-4 font-mono">
                      <span className="text-slate-500">{p.quantity} xabbo</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">${p.revenue.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Section: Low Stock & Audit Alerts (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Low Stock Alerts */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span>Alaabta Dhammaanaysa ({lowStockCount})</span>
            </h3>

            {lowStockCount === 0 ? (
              <div className="py-6 text-center text-emerald-600 text-xs font-semibold">
                Dhammaan alaabta kaydkeedu wuu ku filan yahay!
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {products
                  .filter(p => {
                    const totalQty = inventory
                      .filter(i => i.productId === p.id)
                      .reduce((sum, i) => sum + i.quantityOnHand, 0);
                    return totalQty <= p.minStockLevel;
                  })
                  .map(p => {
                    const totalQty = inventory
                      .filter(i => i.productId === p.id)
                      .reduce((sum, i) => sum + i.quantityOnHand, 0);
                    return (
                      <div key={p.id} className="p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-xl flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">{p.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">SKU: {p.sku}</span>
                        </div>
                        <span className="font-bold font-mono text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/60 px-2 py-0.5 rounded">
                          {totalQty} xabbo
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Quick Ledger Check */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Hubinta Xisaabaadka Nidaamka</span>
            </h3>

            <div className="space-y-2 text-xs font-mono text-slate-700 dark:text-slate-300">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex justify-between">
                <span>Iibka Guud:</span>
                <span className="font-bold">${totalRevenues.toFixed(2)}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex justify-between">
                <span>Kharashka Alaabta:</span>
                <span className="font-bold">${totalCost.toFixed(2)}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex justify-between">
                <span>Faa'iidada Saafiga:</span>
                <span className="font-bold text-emerald-600">${grossProfit.toFixed(2)}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex justify-between">
                <span>Deymaha Maqan:</span>
                <span className="font-bold text-red-600">${totalOutstandingDebt.toFixed(2)}</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
