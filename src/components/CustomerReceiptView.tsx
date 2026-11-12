/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Printer, ShieldCheck, ShoppingBag, ArrowLeft } from 'lucide-react';

interface CustomerReceiptViewProps {
  receiptNumber: string;
  encodedData?: string | null;
  onExit?: () => void;
}

export function CustomerReceiptView({ receiptNumber, encodedData, onExit }: CustomerReceiptViewProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Try decoding from URL encodedData for instantaneous loading
    if (encodedData) {
      try {
        const decoded = JSON.parse(decodeURIComponent(escape(atob(encodedData))));
        setReceipt({
          invoiceNumber: decoded.n || receiptNumber,
          timestamp: decoded.t || new Date().toISOString(),
          storeName: decoded.s || 'BULAALE MINI MARKET',
          storeLocation: decoded.l || 'Main Branch',
          storePhone: decoded.p || '',
          customerName: decoded.c || 'Macmiil Caddaan',
          paymentMethod: decoded.m || 'CADDAAN',
          isCreditSale: decoded.m === 'DEYN',
          items: decoded.items || [],
          totalAmount: decoded.tot || 0,
          subtotal: decoded.sub || decoded.tot || 0,
          cashReceived: decoded.paid,
          changeDue: decoded.change
        });
        setLoading(false);
        return;
      } catch (e) {
        console.warn('URL receipt decode fallback to API:', e);
      }
    }

    // 2. Fetch from public server endpoint safely
    fetch(`/api/public/receipt/${encodeURIComponent(receiptNumber)}`)
      .then(async (res) => {
        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();
        const trimmed = text.trim();
        if (contentType.includes('application/json') || trimmed.startsWith('{')) {
          try {
            return JSON.parse(trimmed);
          } catch {
            throw new Error(`HTTP ${res.status}`);
          }
        }
        throw new Error(trimmed.replace(/<[^>]*>/g, '').trim().slice(0, 100) || `HTTP ${res.status}`);
      })
      .then(data => {
        if (data.success && data.receipt) {
          setReceipt(data.receipt);
        } else {
          setError(data.message || 'Rasiidkan lagama helin nidaamka.');
        }
      })
      .catch((err) => {
        console.warn('Receipt fetch notice:', err);
        setError('Rasiidkan lagama helin nidaamka ama xiriirka server-ka lama helin.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [receiptNumber, encodedData]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-black flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 max-w-sm w-full text-center space-y-3 shadow-xl">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Rasiidka elektaroonigga ah ayaa la soo qaadayaa...
          </p>
        </div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-black flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 max-w-sm w-full text-center space-y-4 shadow-xl">
          <ShoppingBag className="w-10 h-10 text-slate-400 mx-auto" />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Rasiidka Lama Helin</h3>
            <p className="text-xs text-slate-500 mt-1">{error || 'Fadlan hubi koodhka rasiidkaaga.'}</p>
          </div>
          {onExit && (
            <button
              onClick={onExit}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Bogga Hore
            </button>
          )}
        </div>
      </div>
    );
  }

  const items = receipt.items || [];
  const total = Number(receipt.totalAmount) || 0;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-black py-6 px-3 sm:px-4 flex flex-col items-center justify-center font-sans" dir="ltr">
      
      {/* Top Floating Action Bar */}
      <div className="w-full max-w-md flex items-center justify-between mb-3 no-print">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Rasiidka Rasmiga ah (Verified Receipt)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Daabac / PDF</span>
          </button>
          {onExit && (
            <button
              onClick={onExit}
              className="p-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs cursor-pointer"
              title="Bogga Hore"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Official Receipt Paper Card */}
      <div className="w-full max-w-md bg-white text-black p-6 rounded-2xl shadow-xl border border-slate-200 font-mono text-xs select-none">
        
        {/* Header */}
        <div className="text-center border-b-2 border-dashed border-slate-300 pb-4 mb-4">
          <h1 className="text-base font-black uppercase tracking-tight font-sans">
            {receipt.storeName || 'BULAALE MINI MARKET'}
          </h1>
          {receipt.storeLocation && (
            <p className="text-[11px] text-slate-600 mt-0.5">{receipt.storeLocation}</p>
          )}
          {receipt.storePhone && (
            <p className="text-[11px] text-slate-600">Tel: {receipt.storePhone}</p>
          )}
          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-sans font-bold mt-2">
            <CheckCircle2 className="w-3 h-3" />
            <span>Iib Rasmi ah oo La Xaqiijiyay</span>
          </div>
        </div>

        {/* Invoice Meta */}
        <div className="space-y-1 border-b border-dashed border-slate-300 pb-3 mb-3 text-[11px]">
          <div className="flex justify-between">
            <span className="text-slate-500">Rasiidka #:</span>
            <span className="font-bold">{receipt.invoiceNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Taariikhda:</span>
            <span>{new Date(receipt.timestamp).toLocaleString('en-US')}</span>
          </div>
          {receipt.customerName && (
            <div className="flex justify-between">
              <span className="text-slate-500">Macmiilka:</span>
              <span className="font-semibold">{receipt.customerName}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Nooca Bixinta:</span>
            <span className="font-bold uppercase">
              {receipt.isCreditSale ? 'DEYN (POSTPAID)' : 'CADDAAN (PAID)'}
            </span>
          </div>
        </div>

        {/* Itemized Table */}
        <div className="border-b-2 border-dashed border-slate-300 pb-3 mb-3">
          <div className="flex justify-between font-bold text-[10px] uppercase text-slate-500 mb-2 border-b border-slate-200 pb-1">
            <span className="flex-1">Alaabta</span>
            <span className="w-12 text-center">Tiro</span>
            <span className="w-16 text-right">Qiimaha</span>
            <span className="w-16 text-right">Wadarta</span>
          </div>

          <div className="space-y-1.5">
            {items.map((it: any, idx: number) => {
              const name = it.productName || it.name || 'Alaab';
              const qty = it.quantity || it.qty || 1;
              const price = Number(it.soldPrice || it.price || 0);
              const lineTotal = Number(it.tot || (price * qty));

              return (
                <div key={idx} className="flex justify-between items-center text-[11px]">
                  <span className="flex-1 truncate pr-2 font-medium">{name}</span>
                  <span className="w-12 text-center font-bold">x{qty}</span>
                  <span className="w-16 text-right">${price.toFixed(2)}</span>
                  <span className="w-16 text-right font-bold">${lineTotal.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals */}
        <div className="space-y-1.5 pb-4 mb-4 border-b border-dashed border-slate-300">
          <div className="flex justify-between text-sm font-black pt-1">
            <span>WADARTA GUUD:</span>
            <span className="text-base font-bold">${total.toFixed(2)}</span>
          </div>
          {receipt.cashReceived !== undefined && !receipt.isCreditSale && (
            <div className="flex justify-between text-[11px] text-slate-600">
              <span>Lacagta La Bixiyay:</span>
              <span>${Number(receipt.cashReceived).toFixed(2)}</span>
            </div>
          )}
          {receipt.changeDue !== undefined && receipt.changeDue > 0 && !receipt.isCreditSale && (
            <div className="flex justify-between text-[11px] text-slate-600">
              <span>Celin:</span>
              <span>${Number(receipt.changeDue).toFixed(2)}</span>
            </div>
          )}
          {receipt.isCreditSale && (
            <div className="flex justify-between text-[11px] text-red-600 font-bold">
              <span>Deynta Lagu Qoray:</span>
              <span>${total.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center space-y-1 text-[10px] text-slate-500 font-sans">
          <p className="font-bold text-slate-700">Mahadsanid! Soo Dhawoow Mar Kale.</p>
          <p>Rasiidkan waa mid rasmi ah oo elektaroonig ah.</p>
        </div>

      </div>
    </div>
  );
}
