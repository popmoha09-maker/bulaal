import React, { useEffect, useState, useRef } from 'react';
import { Printer, Copy, Check, X, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { Invoice } from '../types';

export interface OfficialReceiptProps {
  invoice: Invoice;
  enterprise?: {
    companyName?: string;
    companyLocation?: string;
    warehouseName?: string;
    companyCode?: string;
    phone?: string;
    tin?: string;
  } | null;
  cashReceived?: number;
  changeDue?: number;
  onClose?: () => void;
  isModal?: boolean;
}

export const OfficialReceipt: React.FC<OfficialReceiptProps> = ({
  invoice,
  enterprise,
  cashReceived,
  changeDue,
  onClose,
  isModal = false,
}) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  const storeName = enterprise?.companyName || 'BULAALE MINI MARKET';
  const storeLocation = enterprise?.companyLocation || 'Suuqa Weyn · Laanta 01';
  const storePhone = enterprise?.phone || '+252 61 500 0000';
  const receiptFooter = enterprise?.receiptFooter || 'Alaabta waxaa la soo celin karaa 3 cisho gudahood adigoo wata rasiidkan.';

  const totalAmount = invoice.totalAmount || 0;
  const totalItemsCount = invoice.items.reduce((sum, item) => sum + item.quantity, 0);

  // Generate QR Code that leads customer to their electronic verified receipt on the site
  useEffect(() => {
    const summary = {
      n: invoice.invoiceNumber,
      t: invoice.timestamp,
      s: storeName,
      l: storeLocation,
      p: storePhone,
      c: invoice.customerName || '',
      m: invoice.isCreditSale ? 'DEYN' : 'CADDAAN',
      items: invoice.items.map(it => ({
        name: it.productName,
        qty: it.quantity,
        price: it.soldPrice,
        tot: Number((it.soldPrice * it.quantity).toFixed(2))
      })),
      tot: totalAmount,
      paid: cashReceived !== undefined ? Number(cashReceived) : totalAmount,
      change: changeDue !== undefined ? Number(changeDue) : 0
    };

    let encodedData = '';
    try {
      encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(summary))));
    } catch (e) {}

    const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://bulaale-pos.web.app';
    const publicReceiptUrl = `${appOrigin}/?receipt=${encodeURIComponent(invoice.invoiceNumber)}&d=${encodeURIComponent(encodedData)}`;

    QRCode.toDataURL(publicReceiptUrl, {
      width: 130,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error('Failed to generate receipt QR code:', err));
  }, [invoice, storeName, storeLocation, storePhone, totalAmount, cashReceived, changeDue]);

  // Keep print container synchronized
  useEffect(() => {
    const timer = setTimeout(() => {
      const printContainer = document.getElementById('official-receipt-print-area');
      if (printContainer && receiptRef.current) {
        printContainer.innerHTML = receiptRef.current.innerHTML;
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [invoice, qrCodeUrl, storeName, storeLocation, totalAmount]);

  const handlePrint = () => {
    const receiptEl = document.getElementById('official-receipt-card');
    if (!receiptEl) {
      window.print();
      return;
    }

    // Isolated print iframe to guarantee printing ONLY the paper receipt slip
    let printFrame = document.getElementById('receipt-print-iframe') as HTMLIFrameElement;
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'receipt-print-iframe';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      document.body.appendChild(printFrame);
    }

    const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
    if (!frameDoc) {
      window.print();
      return;
    }

    frameDoc.open();
    frameDoc.write(`
      <!DOCTYPE html>
      <html lang="so" dir="ltr">
      <head>
        <meta charset="UTF-8">
        <title>Rasiidka - ${invoice.invoiceNumber}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: 'JetBrains Mono', 'Courier New', Courier, monospace;
            background: #ffffff !important;
            color: #000000 !important;
            width: 76mm;
            max-width: 76mm;
            margin: 0 auto;
            padding: 4mm 2mm 6mm 2mm;
            font-size: 11px;
            line-height: 1.25;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .border-b { border-bottom: 1px dashed #000000; }
          .border-t { border-top: 1px dashed #000000; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-left { text-align: left; }
          .flex { display: flex; }
          .justify-between { justify-content: space-between; }
          .font-bold { font-weight: bold; }
          .uppercase { text-transform: uppercase; }
          img { display: block; margin: 0 auto; max-width: 100%; }
        </style>
      </head>
      <body>
        ${receiptEl.innerHTML}
      </body>
      </html>
    `);
    frameDoc.close();

    setTimeout(() => {
      try {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
      } catch (e) {
        window.print();
      }
    }, 250);
  };

  const handleCopyText = () => {
    const lines = [
      `========================================`,
      `           ${storeName.toUpperCase()}`,
      `            RASIIDKA RASMIGA AH`,
      `          ${storeLocation}`,
      `            TEL: ${storePhone}`,
      `========================================`,
      `Lambarka Rasiidka : ${invoice.invoiceNumber}`,
      `Taariikhda & Xilliga : ${new Date(invoice.timestamp).toLocaleString('en-US')}`,
      `Iibiyaha           : Mulkiilaha`,
      invoice.customerName ? `Macmiilka          : ${invoice.customerName}` : null,
      `Nooca Bixinta      : ${invoice.isCreditSale ? 'DEYN (POSTPAID)' : 'CADDAAN'}`,
      `----------------------------------------`,
      `ALAABTA               QTY   QIIMAHA  WADARTA`,
      `----------------------------------------`,
      ...invoice.items.map(
        (it) =>
          `${it.productName.padEnd(20).slice(0, 20)} ${String(it.quantity).padStart(3)} $${it.soldPrice.toFixed(2).padStart(5)} $${(it.soldPrice * it.quantity).toFixed(2).padStart(6)}`
      ),
      `----------------------------------------`,
      `WADARTA GUUD:       $${totalAmount.toFixed(2)}`,
      !invoice.isCreditSale && cashReceived !== undefined ? `Lacagta La Bixiyay:  $${Number(cashReceived).toFixed(2)}` : null,
      !invoice.isCreditSale && changeDue !== undefined && changeDue > 0 ? `Lacagta Celin:       $${Number(changeDue).toFixed(2)}` : null,
      invoice.isCreditSale ? `DEYNTA LAGU QORAY:   $${totalAmount.toFixed(2)}` : null,
      `========================================`,
      `    MAHADSANID! SOO DHAWOOW MAR KALE!`,
      ` ${receiptFooter}`,
      `========================================`
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const receiptContent = (
    <div className="flex flex-col items-center w-full">
      {/* Action Toolbar on Screen */}
      <div className="w-full max-w-[340px] flex items-center justify-between gap-2 mb-3 no-print">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Rasiidka 80mm</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyText}
            className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer text-xs flex items-center gap-1"
            title="Koobi garee qoraalka"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="text-[11px] font-medium">{copied ? 'La koobiyay' : 'Koobi'}</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer text-xs flex items-center gap-1.5 shadow-sm"
            title="Daabac Rasiidka"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Daabac Rasiidka</span>
          </button>
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
              title="Xir"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* THE OFFICIAL THERMAL RECEIPT SLIP CONTAINER */}
      <div 
        ref={receiptRef}
        id="official-receipt-card"
        className="official-thermal-receipt w-full max-w-[340px] bg-white text-slate-950 shadow-2xl rounded-none border border-slate-300 text-[11px] leading-tight select-text overflow-hidden"
        style={{
          fontFamily: "'JetBrains Mono', 'Courier New', Courier, monospace",
          backgroundColor: '#ffffff',
          color: '#0a0a0a'
        }}
        dir="ltr"
      >
        {/* Jagged Sawtooth Paper Edge Top */}
        <div className="w-full h-2.5 bg-slate-200/80 dark:bg-slate-800/80 overflow-hidden relative no-print">
          <svg viewBox="0 0 340 10" preserveAspectRatio="none" className="w-full h-full fill-white">
            <path d="M0,0 L10,10 L20,0 L30,10 L40,0 L50,10 L60,0 L70,10 L80,0 L90,10 L100,0 L110,10 L120,0 L130,10 L140,0 L150,10 L160,0 L170,10 L180,0 L190,10 L200,0 L210,10 L220,0 L230,10 L240,0 L250,10 L260,0 L270,10 L280,0 L290,10 L300,0 L310,10 L320,0 L330,10 L340,0 L340,10 L0,10 Z" />
          </svg>
        </div>

        {/* Receipt Paper Inner Content */}
        <div className="p-4 sm:p-5 flex flex-col gap-3">
          
          {/* Header Brand */}
          <div className="text-center pb-2 border-b border-dashed border-slate-400">
            <h2 className="text-sm sm:text-base font-black tracking-tight uppercase text-black">
              {storeName}
            </h2>
            <p className="text-[10px] text-slate-700 font-bold uppercase tracking-wider mt-0.5">
              Suuqa & Dukaanka Guud
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              {storeLocation}
            </p>
            <p className="text-[10px] text-slate-600">
              Tel: {storePhone}
            </p>
            
            <div className="mt-2 pt-1 border-t border-dotted border-slate-300">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 px-2 py-0.5 border border-slate-300">
                RASIIDKA RASMIGA AH
              </span>
            </div>
          </div>

          {/* Transaction Metadata */}
          <div className="text-[10px] space-y-1 pb-2 border-b border-dashed border-slate-400">
            <div className="flex justify-between">
              <span className="text-slate-600">Lambarka Rasiidka:</span>
              <span className="font-bold text-black">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Taariikhda & Waqtiga:</span>
              <span className="font-semibold text-black">
                {new Date(invoice.timestamp).toLocaleDateString('en-GB')}{' '}
                {new Date(invoice.timestamp).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Iibiyaha:</span>
              <span className="text-black font-semibold">Mulkiilaha (POS #01)</span>
            </div>
            {invoice.customerName && (
              <div className="flex justify-between">
                <span className="text-slate-600">Macmiilka:</span>
                <span className="font-bold text-black">{invoice.customerName}</span>
              </div>
            )}
            <div className="flex justify-between font-bold">
              <span className="text-slate-600">Nooca Bixinta:</span>
              {invoice.isCreditSale ? (
                <span className="text-amber-800 bg-amber-100 px-1 py-0.2 rounded font-bold">DEYN (POSTPAID)</span>
              ) : (
                <span className="text-emerald-800 bg-emerald-100 px-1 py-0.2 rounded font-bold">LACAG CADDAAN AH</span>
              )}
            </div>
          </div>

          {/* Itemized Table */}
          <div className="pb-2 border-b border-dashed border-slate-400">
            <div className="grid grid-cols-12 text-[10px] font-bold pb-1 mb-1 border-b border-dotted border-slate-300 text-slate-900">
              <span className="col-span-6 text-left">ALAABTA</span>
              <span className="col-span-2 text-center">QTY</span>
              <span className="col-span-2 text-right">QIIMAHA</span>
              <span className="col-span-2 text-right">WADARTA</span>
            </div>

            <div className="space-y-1.5 text-[10px]">
              {invoice.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 leading-tight">
                  <div className="col-span-6 text-left truncate pr-1">
                    <span className="font-bold text-black block truncate">{item.productName}</span>
                    <span className="text-[9px] text-slate-500 block">
                      {item.sku ? `#${item.sku}` : ''}
                    </span>
                  </div>
                  <span className="col-span-2 text-center font-semibold text-black self-start">
                    {item.quantity}
                  </span>
                  <span className="col-span-2 text-right text-slate-700 self-start">
                    ${item.soldPrice.toFixed(2)}
                  </span>
                  <span className="col-span-2 text-right font-bold text-black self-start">
                    ${(item.soldPrice * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals & Payments */}
          <div className="space-y-1 text-[10px] pb-2 border-b border-dashed border-slate-400">
            <div className="flex justify-between text-slate-600">
              <span>Wadarta Xabadaha ({totalItemsCount} xabbo):</span>
              <span className="font-semibold text-black">${totalAmount.toFixed(2)}</span>
            </div>
            
            {/* Grand Total */}
            <div className="pt-1.5 mt-1 border-t-2 border-black flex justify-between items-baseline text-xs font-black">
              <span className="text-xs uppercase tracking-tight text-black">WADARTA GUUD</span>
              <span className="text-sm font-black text-black">
                ${totalAmount.toFixed(2)}
              </span>
            </div>

            {/* Payment Details */}
            {!invoice.isCreditSale ? (
              <>
                {cashReceived !== undefined && (
                  <div className="flex justify-between text-slate-700 pt-1">
                    <span>Lacagta La Dhiibay:</span>
                    <span className="font-semibold text-black">${Number(cashReceived).toFixed(2)}</span>
                  </div>
                )}
                {changeDue !== undefined && changeDue > 0 && (
                  <div className="flex justify-between text-emerald-800 font-bold">
                    <span>Lacagta Celin:</span>
                    <span>${Number(changeDue).toFixed(2)}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-between text-amber-900 font-bold pt-1 bg-amber-50 p-1 border border-amber-200 rounded">
                <span>Deynta Ku Qoran Macmiilka:</span>
                <span>${totalAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Verification QR Code & Barcode */}
          <div className="flex flex-col items-center justify-center pt-1 text-center">
            {qrCodeUrl && (
              <div className="p-1 bg-white border border-slate-300 rounded mb-1">
                <img 
                  src={qrCodeUrl} 
                  alt="QR Code-ka Rasiidka" 
                  className="w-20 h-20 object-contain mx-auto"
                />
              </div>
            )}
            <span className="text-[8px] text-slate-500 font-mono">
              Baar QR Code-ka si aad u hubisid rasiidka
            </span>

            {/* 1D Barcode */}
            <div className="w-full mt-2 pt-1 border-t border-dotted border-slate-300 flex flex-col items-center">
              <div className="flex items-center justify-center gap-[2px] h-6 overflow-hidden my-1">
                {Array.from({ length: 42 }).map((_, i) => (
                  <span 
                    key={i} 
                    className="bg-black inline-block h-full"
                    style={{
                      width: (i % 3 === 0 ? '3px' : i % 2 === 0 ? '1.5px' : '1px'),
                      marginRight: (i % 5 === 0 ? '1.5px' : '0.5px')
                    }}
                  />
                ))}
              </div>
              <span className="text-[9px] tracking-widest font-mono text-black font-bold">
                * {invoice.invoiceNumber} *
              </span>
            </div>
          </div>

          {/* Official Terms & Footer Notice */}
          <div className="text-center pt-2 border-t border-dashed border-slate-400 text-[9px] text-slate-600 space-y-1 leading-snug">
            <p className="font-bold text-black">
              MAHADSANID! SOO DHAWOOW MAR KALE!
            </p>
            <p>
              {receiptFooter}
            </p>
            <p className="text-[8px] text-slate-500">
              Nidaamka Iibka ee {storeName}
            </p>
          </div>

        </div>

        {/* Jagged Sawtooth Paper Edge Bottom */}
        <div className="w-full h-2.5 bg-slate-200/80 dark:bg-slate-800/80 overflow-hidden relative no-print">
          <svg viewBox="0 0 340 10" preserveAspectRatio="none" className="w-full h-full fill-white">
            <path d="M0,10 L10,0 L20,10 L30,0 L40,10 L50,0 L60,10 L70,0 L80,10 L90,0 L100,10 L110,0 L120,10 L130,0 L140,10 L150,0 L160,10 L170,0 L180,10 L190,0 L200,10 L210,0 L220,10 L230,0 L240,10 L250,0 L260,10 L270,0 L280,10 L290,0 L300,10 L310,0 L320,10 L330,0 L340,10 L340,0 L0,0 Z" />
          </svg>
        </div>

      </div>
    </div>
  );

  if (isModal) {
    return (
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto no-print"
        dir="ltr"
      >
        <div className="relative w-full max-w-md my-auto py-4 flex justify-center">
          {receiptContent}
        </div>
      </div>
    );
  }

  return receiptContent;
};
