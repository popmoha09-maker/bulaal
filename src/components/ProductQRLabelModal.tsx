import React, { useEffect, useState, useRef } from 'react';
import { X, Printer, QrCode, Tag } from 'lucide-react';
import QRCode from 'qrcode';
import { Product } from '../types';

interface ProductQRLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  storeName?: string;
}

export function ProductQRLabelModal({
  isOpen,
  onClose,
  product,
  storeName = 'BULAALE MINI MARKET'
}: ProductQRLabelModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!product) return;
    const qrPayload = JSON.stringify({
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      price: product.retailPrice,
      color: product.color || '',
      size: product.size || ''
    });

    QRCode.toDataURL(qrPayload, {
      width: 160,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('Failed to generate product QR code:', err));
  }, [product]);

  if (!isOpen || !product) return null;

  const handlePrintLabel = () => {
    const printArea = document.getElementById('official-receipt-print-area');
    if (printArea && labelRef.current) {
      printArea.innerHTML = labelRef.current.innerHTML;
    }
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs" dir="ltr">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="bg-slate-100 dark:bg-slate-950 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Daabac Koodhka Alaabta (QR / Barcode Label)</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Label Preview Container */}
        <div className="p-6 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950/50">
          <div 
            ref={labelRef}
            className="w-72 bg-white text-black p-4 rounded-xl border-2 border-dashed border-slate-400 shadow-md flex flex-col items-center text-center font-sans select-none"
            style={{ minHeight: '260px' }}
          >
            {/* Store Name Header */}
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 border-b border-slate-300 pb-1 w-full block">
              {storeName}
            </span>

            {/* Product Title */}
            <h4 className="font-bold text-sm text-black mt-2 leading-tight line-clamp-2">
              {product.name}
            </h4>

            {/* Color & Size Tags if available */}
            {(product.color || product.size || product.category) && (
              <div className="flex items-center justify-center gap-1.5 mt-1 flex-wrap text-[10px] text-slate-600 font-semibold">
                {product.color && <span className="bg-slate-100 px-1.5 py-0.5 rounded">Midab: {product.color}</span>}
                {product.size && <span className="bg-slate-100 px-1.5 py-0.5 rounded">Size: {product.size}</span>}
                {product.category && <span className="bg-slate-100 px-1.5 py-0.5 rounded">{product.category}</span>}
              </div>
            )}

            {/* QR Code Center Image */}
            <div className="my-2 p-1 bg-white border border-slate-300 rounded-lg shadow-2xs">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={product.name} className="w-28 h-28 object-contain" />
              ) : (
                <div className="w-28 h-28 flex items-center justify-center text-xs text-slate-400">
                  Loading QR...
                </div>
              )}
            </div>

            {/* Selling Retail Price */}
            <div className="w-full bg-slate-900 text-white py-1 rounded-md mt-1">
              <span className="text-[10px] uppercase font-bold opacity-80 mr-1">Qiimaha:</span>
              <span className="text-base font-black font-mono">${product.retailPrice.toFixed(2)}</span>
            </div>

            {/* Barcode & SKU Footer */}
            <div className="w-full mt-2 pt-1 border-t border-slate-200 flex justify-between items-center text-[10px] font-mono text-slate-600">
              <span>SKU: {product.sku}</span>
              <span className="font-bold text-black">{product.barcode || product.sku}</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-4 text-center">
            Ku dhaji sumaddan alaabta si aad ugu baarto qalabka Scanner-ka markaad iibinaysid ama soo gelinaysid.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-100 dark:bg-slate-950 px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
          >
            Xir (Close)
          </button>
          
          <button
            type="button"
            onClick={handlePrintLabel}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Daabac Tag-ga (Print Label)</span>
          </button>
        </div>

      </div>
    </div>
  );
}
