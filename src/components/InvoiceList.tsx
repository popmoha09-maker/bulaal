import React, { useState } from 'react';
import { Invoice, User } from '../types';
import { 
  Receipt, Search, Eye, Trash2, 
  CheckCircle, RefreshCw, FileSpreadsheet, Download
} from 'lucide-react';
import { OfficialReceipt } from './OfficialReceipt';

interface InvoiceListProps {
  invoices: Invoice[];
  currentUser: User;
  onVoidInvoice: (invoiceId: string) => void;
  onClearInvoiceHistory?: () => void;
  onAddAuditLog: (action: string, details: string, type: 'info' | 'warning' | 'error' | 'success') => void;
  enterprise?: any;
}

export function InvoiceList({
  invoices,
  currentUser,
  onVoidInvoice,
  onClearInvoiceHistory,
  onAddAuditLog,
  enterprise
}: InvoiceListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceToVoid, setInvoiceToVoid] = useState<Invoice | null>(null);
  const [isClearHistoryConfirmOpen, setIsClearHistoryConfirmOpen] = useState(false);

  // Filter invoices
  const filteredInvoices = invoices.filter((inv) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.customerName && inv.customerName.toLowerCase().includes(q)) ||
      inv.cashierName.toLowerCase().includes(q)
    );
  });

  const totalSalesVolume = filteredInvoices.reduce((acc, i) => acc + i.totalAmount, 0);

  const handleVoidConfirm = () => {
    if (!invoiceToVoid) return;
    onVoidInvoice(invoiceToVoid.id);
    onAddAuditLog(
      'Burrinta Foomka Iibka', 
      `Foomka #${invoiceToVoid.invoiceNumber} ($${invoiceToVoid.totalAmount.toFixed(2)}) waa la burriyay.`, 
      'error'
    );
    if (selectedInvoice?.id === invoiceToVoid.id) {
      setSelectedInvoice(null);
    }
    setInvoiceToVoid(null);
  };

  const exportToCSV = () => {
    let csv = 'Invoice Number,Date,Customer,Payment Type,Total Amount,Items Count,Status\n';
    filteredInvoices.forEach(inv => {
      const itemsCount = inv.items.reduce((sum, item) => sum + item.quantity, 0);
      csv += `"${inv.invoiceNumber}","${inv.timestamp}","${inv.customerName || 'Caddaan'}","${inv.isCreditSale ? 'DEYN' : 'CADDAAN'}",${inv.totalAmount.toFixed(2)},${itemsCount},"${inv.status}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `foomamka_iibka_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full overflow-hidden text-left text-slate-900 dark:text-slate-100 font-sans" dir="ltr">
      
      {/* LEFT PANEL: Invoices Spreadsheet (8 Cols) */}
      <div className="lg:col-span-8 flex flex-col bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 shadow-md overflow-hidden h-full rounded-2xl">
        
        {/* Actions header */}
        <div className="p-4 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between text-xs">
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <span className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">Raadi Foomamka:</span>
            <div className="relative flex-1 sm:w-64">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Lambarka rasiidka ama macmiilka..."
                className="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:border-blue-500 text-xs text-left"
              />
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={exportToCSV}
              className="px-3.5 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors text-xs whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Nuqul CSV ah</span>
            </button>
            {onClearInvoiceHistory && invoices.length > 0 && (
              <button
                type="button"
                onClick={() => setIsClearHistoryConfirmOpen(true)}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors text-xs whitespace-nowrap"
                title="Tirtir dhammaan taariikhda iibka"
              >
                <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>Tirtir Taariikhda Iibka</span>
              </button>
            )}
          </div>
        </div>

        {/* Invoices table */}
        <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
          <table className="w-full text-left border-collapse text-xs" dir="ltr">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 font-bold sticky top-0 z-10 select-none">
                <th className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 text-center w-10">#</th>
                <th className="px-3.5 py-3 border-r border-slate-200 dark:border-slate-800 w-32 font-mono text-left">Foomka</th>
                <th className="px-3.5 py-3 border-r border-slate-200 dark:border-slate-800 w-36 font-mono text-left">Taariikhda</th>
                <th className="px-3.5 py-3 border-r border-slate-200 dark:border-slate-800 text-left">Macmiilka / Bixinta</th>
                <th className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 text-center w-20">Xabbadaha</th>
                <th className="px-3.5 py-3 border-r border-slate-200 dark:border-slate-800 text-right w-24">Wadarta</th>
                <th className="px-3 py-3 border-r border-slate-200 dark:border-slate-800 text-center w-20">Xaaladda</th>
                <th className="px-3 py-3 text-center w-20">Hawsha</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-950 divide-y divide-slate-150 dark:divide-slate-850 font-medium">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500 font-sans">
                    Wax foomam iib ah lama helin.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv, idx) => {
                  const isVoided = inv.totalAmount === 0;
                  return (
                    <tr 
                      key={inv.id} 
                      onClick={() => setSelectedInvoice(inv)}
                      className={`cursor-pointer transition-colors ${
                        selectedInvoice?.id === inv.id 
                          ? 'bg-blue-50/80 dark:bg-slate-850 border-l-4 border-l-blue-600' 
                          : 'hover:bg-slate-50/50 dark:hover:bg-slate-900/60'
                      } ${isVoided ? 'opacity-50 line-through' : ''}`}
                    >
                      <td className="px-3 py-2.5 border-r border-slate-150 dark:border-slate-800 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-3.5 py-2.5 border-r border-slate-150 dark:border-slate-800 font-mono text-slate-800 dark:text-slate-200 text-left">{inv.invoiceNumber}</td>
                      <td className="px-3.5 py-2.5 border-r border-slate-150 dark:border-slate-800 text-slate-500 font-sans text-[11px] text-left">
                        {new Date(inv.timestamp).toLocaleDateString('en-GB')} {new Date(inv.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-3.5 py-2.5 border-r border-slate-150 dark:border-slate-800 font-sans text-slate-700 dark:text-slate-300 text-left">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-900 dark:text-white">{inv.customerName || 'Caddaan (Walk-in)'}</span>
                          {inv.isCreditSale ? (
                            <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 rounded font-bold">DEYN</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 rounded font-bold">CADDAAN</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 border-r border-slate-150 dark:border-slate-800 text-center font-mono">
                        {inv.items.reduce((acc, x) => acc + x.quantity, 0)}
                      </td>
                      <td className="px-3.5 py-2.5 border-r border-slate-150 dark:border-slate-800 text-right font-bold text-slate-950 dark:text-slate-100 font-mono">
                        ${inv.totalAmount.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 border-r border-slate-150 dark:border-slate-800 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                          <CheckCircle className="w-3 h-3" />
                          <span>Keydsan</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg cursor-pointer"
                            title="Arag Rasiidka"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {!isVoided && (
                            <button
                              onClick={() => setInvoiceToVoid(inv)}
                              className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                              title="Burri Iibka"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Calculations bar */}
        <div className="p-3.5 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
          <span>Wadarta Guud ee Iibka:</span>
          <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">${totalSalesVolume.toFixed(2)}</span>
        </div>
      </div>

      {/* RIGHT PANEL: Selected Receipt Preview */}
      <div className="lg:col-span-4 flex flex-col bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 overflow-hidden h-full rounded-2xl">
        <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-3 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between font-display">
          <span>Muuqaalka Rasiidka</span>
        </div>

        <div className="flex-1 p-3 overflow-y-auto bg-slate-50 dark:bg-slate-950 flex flex-col items-center" dir="ltr">
          {selectedInvoice ? (
            <div className="w-full flex flex-col items-center gap-3">
              <OfficialReceipt
                invoice={selectedInvoice}
                enterprise={enterprise}
                isModal={false}
              />
              {selectedInvoice.totalAmount > 0 && (
                <div className="w-full max-w-[340px] pt-1 border-t border-slate-200 dark:border-slate-800 no-print">
                  <button
                    onClick={() => setInvoiceToVoid(selectedInvoice)}
                    className="w-full py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 rounded-xl font-semibold text-xs cursor-pointer transition-colors"
                  >
                    Burri Rasiidkan oo ku celi kaydka
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500 p-4" dir="ltr">
              <Receipt className="w-10 h-10 text-slate-400 dark:text-slate-600 stroke-1 mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Dooro foom si aad u aragto rasiidka</p>
            </div>
          )}
        </div>
      </div>

      {/* IN-APP SAFE VOID CONFIRMATION MODAL */}
      {invoiceToVoid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs" dir="ltr">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Burrinta Foomka Iibka
              </h3>
              <p className="text-xs text-slate-500">
                Ma hubtaa inaad burriso foomka <span className="font-bold text-slate-800 dark:text-slate-200">#{invoiceToVoid.invoiceNumber}</span>?
              </p>
              <p className="text-[11px] text-amber-600 font-medium">
                Alaabta foomkan ku jirtay waxaa si toos ah dib loogu celinayaa bakhaarka.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInvoiceToVoid(null)}
                className="flex-1 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Ka Noqo
              </button>
              <button
                type="button"
                onClick={handleVoidConfirm}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                Haa, Burri
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR ALL INVOICE HISTORY CONFIRMATION MODAL */}
      {isClearHistoryConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs" dir="ltr">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1.5">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                Ma hubtaa inaad tirtirto dhammaan foomamka iibka?
              </h4>
              <p className="text-xs text-slate-500">
                Ficilkan wuxuu masaxayaa dhammaan taariikhda {invoices.length} foomamka iibka ah ee ku keydsan nidaamka.
              </p>
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 font-semibold text-left">
                Digniin: Dib looma soo celin karo foomamkan mar haddii la tirtiro.
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsClearHistoryConfirmOpen(false)}
                className="flex-1 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Ka Noqo
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onClearInvoiceHistory) {
                    onClearInvoiceHistory();
                  }
                  setIsClearHistoryConfirmOpen(false);
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                Haa, Tirtir Dhammaan
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
