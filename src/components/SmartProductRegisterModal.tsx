/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../types';
import { 
  Barcode, Package, Tag, DollarSign, Layers, 
  X, Check, AlertCircle, ShoppingCart, Sparkles, Image as ImageIcon
} from 'lucide-react';
import { generateQuickBooksSku } from '../lib/barcodeScanner';

interface SmartProductRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  scannedBarcode: string;
  existingCategories: string[];
  existingProducts: Product[];
  onSaveAndAddToCart: (product: Product, initialStock: number) => Promise<boolean> | boolean;
}

export function SmartProductRegisterModal({
  isOpen,
  onClose,
  scannedBarcode,
  existingCategories,
  existingProducts,
  onSaveAndAddToCart
}: SmartProductRegisterModalProps) {
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [sku, setSku] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [initialStock, setInitialStock] = useState('10');
  const [minStockLevel, setMinStockLevel] = useState('5');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const prevIsOpenRef = useRef(false);
  const prevBarcodeRef = useRef('');

  // Initialize values ONLY when modal freshly opens or scannedBarcode genuinely changes
  useEffect(() => {
    if (isOpen) {
      const cleanCode = (scannedBarcode || '').trim();
      const isFreshOpen = !prevIsOpenRef.current;
      const isNewBarcode = cleanCode && cleanCode !== prevBarcodeRef.current;

      if (isFreshOpen || isNewBarcode) {
        prevIsOpenRef.current = true;
        prevBarcodeRef.current = cleanCode;

        setBarcode(cleanCode);
        setName('');
        setRetailPrice('');
        setCostPrice('');
        setInitialStock('10');
        setMinStockLevel('5');
        setDescription('');
        setImageUrl('');
        setErrorMessage(null);
        setIsSubmitting(false);

        // Auto-assign clean category
        const defaultCat = (existingCategories && existingCategories[0]) || 'Cunto (Food)';
        setCategory(defaultCat);
        setIsCustomCategory(false);
        setCustomCategory('');

        // Auto-generate clean SKU
        setSku(generateQuickBooksSku(defaultCat));

        // Auto-focus name field for rapid typing
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 100);
      }
    } else {
      prevIsOpenRef.current = false;
      prevBarcodeRef.current = '';
    }
  }, [isOpen, scannedBarcode]);

  // Update SKU when category changes
  const handleCategoryChange = (newCat: string) => {
    if (newCat === '__NEW__') {
      setIsCustomCategory(true);
      setCategory('');
    } else {
      setIsCustomCategory(false);
      setCategory(newCat);
      setSku(generateQuickBooksSku(newCat));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMessage('Fadlan qor magaca alaabta.');
      nameInputRef.current?.focus();
      return;
    }

    const cleanBarcode = barcode.trim();
    if (!cleanBarcode) {
      setErrorMessage('Baarkoodhka lama helin.');
      return;
    }

    // Check duplicate barcode
    const duplicate = existingProducts.find(
      p => p.barcode && p.barcode.toLowerCase() === cleanBarcode.toLowerCase()
    );
    if (duplicate) {
      setErrorMessage(`Koodhkan waxaa horey loogu diiwaangeliyay alaabta "${duplicate.name}".`);
      return;
    }

    const numRetail = parseFloat(retailPrice);
    if (isNaN(numRetail) || numRetail <= 0) {
      setErrorMessage('Fadlan geli qiimaha saxda ah ee iibka (Selling Price > 0).');
      return;
    }

    const numCost = parseFloat(costPrice) || 0;
    const numStock = parseInt(initialStock, 10) || 0;
    const numMin = parseInt(minStockLevel, 10) || 5;
    const finalCategory = (isCustomCategory ? customCategory.trim() : category) || 'Guud (General)';

    const newProduct: Product = {
      id: `prod_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      sku: sku.trim() || generateQuickBooksSku(finalCategory),
      name: cleanName,
      barcode: cleanBarcode,
      costPrice: numCost,
      retailPrice: numRetail,
      category: finalCategory,
      minStockLevel: numMin,
      description: description.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      isEncrypted: false
    };

    setIsSubmitting(true);
    try {
      const ok = await onSaveAndAddToCart(newProduct, numStock);
      if (ok) {
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Khalad ayaa dhacay markii la keydinayay alaabta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs text-left" dir="ltr">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-slate-100 dark:bg-slate-850 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Diiwaangelinta Alaab Cusub
              </h3>
              <p className="text-[11px] text-slate-500">
                Baarkoodhkan nidaamka kuma jiro — diiwaangeli si toos ahna kashyarka ugu dar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scanned Barcode Pill Alert */}
        <div className="px-5 py-2.5 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900/50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300">
            <Barcode className="w-4 h-4" />
            <span className="font-semibold">Koodhka la sawiray:</span>
            <span className="font-mono font-bold bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded border border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200">
              {barcode}
            </span>
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
            ✓ Diyaar ah
          </span>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div className="mx-5 mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          
          {/* Product Name */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Magaca Alaabta (Product Name) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Package className="w-3.5 h-3.5" />
              </span>
              <input
                ref={nameInputRef}
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tusaale: Caano Nido 2.5kg, Timir Macaan..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-medium focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Pricing Row: Retail & Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Qiimaha Iibka (Selling Price $) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-emerald-600 font-bold">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Qiimaha Soo Iibinta (Cost Price $)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-mono text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Stock Quantities: Initial Stock & Min Stock Level */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tirada Kaydka (Initial Stock) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Layers className="w-3.5 h-3.5" />
                </span>
                <input
                  type="number"
                  min="1"
                  required
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  placeholder="10"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Digniinta Dhammaadka (Min Alert)
              </label>
              <input
                type="number"
                min="0"
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
                placeholder="5"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-mono text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Category & SKU Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Qaybta (Category)
              </label>
              {!isCustomCategory ? (
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {existingCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="__NEW__">+ Qayb Cusub...</option>
                  </select>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Qor qaybta cusub..."
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setIsCustomCategory(false)}
                    className="px-2 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 rounded-lg text-slate-600 dark:text-slate-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                SKU (Koodhka Diwaanka)
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="SKU-1001"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-mono text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 uppercase"
              />
            </div>
          </div>

          {/* Description (Optional) */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Faahfaahin Kooban (Description - Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Xog dheeraad ah oo ku saabsan alaabta..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Product Image (Optional) */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Sawirka Alaabta (Product Image - Optional)
            </label>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <ImageIcon className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="URL-ka sawirka (https://...) ama dooro fayl..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                />
              </div>
              <label className="px-3 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl cursor-pointer text-xs font-semibold shrink-0">
                <span>Soo Geli</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        if (event.target?.result) {
                          setImageUrl(String(event.target.result));
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            </div>
            {imageUrl && (
              <div className="mt-2 flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-850 rounded-lg">
                <img src={imageUrl} alt="Preview" className="w-10 h-10 object-cover rounded-md border border-slate-300 dark:border-slate-700" />
                <span className="text-[11px] text-slate-500 truncate flex-1">Sawirka waa la xushay</span>
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="text-xs text-red-500 hover:underline px-2 cursor-pointer"
                >
                  Tirtir
                </button>
              </div>
            )}
          </div>

          {/* Submit & Cancel Buttons */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold cursor-pointer transition-colors"
            >
              Ka Noqo
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-98 disabled:opacity-50"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>{isSubmitting ? 'Waa la keydinayaa...' : 'Keydi & Toos Ugu Dar Kashyarka'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
