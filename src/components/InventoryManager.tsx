/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Product, InventoryItem, User, Warehouse } from '../types';
import { 
  Boxes, Plus, AlertTriangle, Search, Edit2, X, Trash2,
  Barcode, Camera, CheckCircle2, DollarSign, FileSpreadsheet
} from 'lucide-react';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ExcelImportModal } from './ExcelImportModal';
import { 
  resolveProductFromCode, 
  generateEan13Barcode 
} from '../lib/barcodeScanner';

interface InventoryManagerProps {
  products: Product[];
  inventory: InventoryItem[];
  currentUser: User;
  onUpdateInventory: (productId: string, warehouse: string, newQuantity: number) => void;
  onAddProduct: (product: Product, initialQty: number, warehouse: string) => void;
  onUpdateProductPrices: (
    productId: string, 
    costPrice: number, 
    retailPrice: number, 
    minStockLevel: number, 
    category?: string,
    color?: string,
    size?: string,
    imageUrl?: string,
    name?: string,
    sku?: string,
    barcode?: string,
    qrCode?: string,
    description?: string
  ) => void;
  onAddAuditLog: (action: string, details: string, type: 'info' | 'warning' | 'error' | 'success') => void;
  isEncryptedCost: boolean;
  onDeleteProduct?: (productId: string) => void;
  onDeleteAllProducts?: () => void;
  warehouses: Warehouse[];
  onAddWarehouse: (name: string, location?: string) => void;
  onDeleteWarehouse: (warehouseId: string) => void;
  initialStockInBarcode?: string | null;
  onClearStockInBarcode?: () => void;
  onBatchImportProducts?: (
    newProducts: Product[],
    newInventory: InventoryItem[],
    updatedProducts: Product[],
    auditSummary: string
  ) => void;
}

export function InventoryManager({
  products,
  inventory,
  currentUser,
  onUpdateInventory,
  onAddProduct,
  onUpdateProductPrices,
  onAddAuditLog,
  isEncryptedCost,
  onDeleteProduct,
  warehouses,
  initialStockInBarcode,
  onClearStockInBarcode,
  onBatchImportProducts
}: InventoryManagerProps) {
  const currentWhId = warehouses[0]?.id || 'w_1';
  const [searchQuery, setSearchQuery] = useState('');
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);

  // Helper to reliably find product stock across warehouses / server defaults
  const getProductStock = (productId: string): number => {
    if (!inventory || inventory.length === 0) return 0;
    const item = inventory.find(
      (i) =>
        i.productId === productId &&
        (i.warehouse === currentWhId ||
         i.warehouse === 'Central Warehouse' ||
         i.warehouse === warehouses[0]?.name ||
         !i.warehouse)
    ) || inventory.find((i) => i.productId === productId);

    return item ? (Number(item.quantityOnHand) || 0) : 0;
  };

  // Helper to parse numbers safely including Arabic/Eastern digits and formatted inputs
  const parseCleanNum = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    let s = String(val).trim();
    if (!s) return 0;
    const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    arabicDigits.forEach((d, idx) => {
      s = s.replaceAll(d, String(idx));
    });
    s = s.replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const res = parseFloat(s);
    return isNaN(res) ? 0 : res;
  };

  // Item Form Modal (Add & Edit) - Clean fields ONLY
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formCostPrice, setFormCostPrice] = useState('');
  const [formRetailPrice, setFormRetailPrice] = useState('');
  const [formInitialQty, setFormInitialQty] = useState('10');
  const [formLowStockAlert, setFormLowStockAlert] = useState('5');

  // Receiving / Restock Modal (Stock IN)
  const [stockInProduct, setStockInProduct] = useState<Product | null>(null);
  const [stockInQtyToAdd, setStockInQtyToAdd] = useState('10');
  const [stockInNewCost, setStockInNewCost] = useState('');
  const [stockInNewRetail, setStockInNewRetail] = useState('');

  // In-app Deletion Confirmation Modal (Fixes iframe window.confirm blocking)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // In-Inventory Camera Scanner Modal
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const lastHandledStockInBarcodeRef = useRef<string | null>(null);

  // Auto-fill or open form when triggered from hardware scanner or external Stock In
  useEffect(() => {
    if (initialStockInBarcode && initialStockInBarcode !== lastHandledStockInBarcodeRef.current) {
      lastHandledStockInBarcodeRef.current = initialStockInBarcode;
      const { product, cleanCode } = resolveProductFromCode(initialStockInBarcode, products);
      if (product) {
        setStockInProduct(product);
        setStockInNewCost(product.costPrice.toString());
        setStockInNewRetail(product.retailPrice.toString());
        setStockInQtyToAdd('10');
      } else {
        openItemForm(null, cleanCode);
      }
      if (onClearStockInBarcode) onClearStockInBarcode();
    } else if (!initialStockInBarcode) {
      lastHandledStockInBarcodeRef.current = null;
    }
  }, [initialStockInBarcode, products, onClearStockInBarcode]);

  // Open Form in Create or Edit mode
  const openItemForm = (product: Product | null = null, defaultBarcode?: string) => {
    if (product) {
      setEditingProductId(product.id);
      setFormName(product.name);
      setFormBarcode(product.barcode || '');
      setFormCostPrice(product.costPrice.toString());
      setFormRetailPrice(product.retailPrice.toString());
      const curStock = getProductStock(product.id);
      setFormInitialQty(curStock.toString());
      setFormLowStockAlert((product.minStockLevel || 5).toString());
    } else {
      setEditingProductId(null);
      setFormName('');
      const genBarcode = defaultBarcode || generateEan13Barcode();
      setFormBarcode(genBarcode);
      setFormCostPrice('');
      setFormRetailPrice('');
      setFormInitialQty('10');
      setFormLowStockAlert('5');
    }
    setIsItemFormOpen(true);
  };

  const handleAutoGenerateBarcode = () => {
    setFormBarcode(generateEan13Barcode());
  };

  // Submit Clean Item Form
  const handleItemFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCostPrice || !formRetailPrice) {
      return;
    }

    const costNum = parseCleanNum(formCostPrice);
    const retailNum = parseCleanNum(formRetailPrice);
    const minAlertNum = parseCleanNum(formLowStockAlert) || 5;
    const qtyNum = parseCleanNum(formInitialQty);
    const finalBarcode = formBarcode.trim() || generateEan13Barcode();
    const finalSku = `SKU-${Date.now().toString().slice(-4)}`;

    if (editingProductId) {
      // Update existing item
      onUpdateProductPrices(
        editingProductId,
        costNum,
        retailNum,
        minAlertNum,
        'Guud',
        undefined,
        undefined,
        undefined,
        formName.trim(),
        undefined,
        finalBarcode,
        finalBarcode,
        undefined
      );

      onUpdateInventory(editingProductId, currentWhId, qtyNum);

      onAddAuditLog(
        'Cusbooneysiinta Alaabta',
        `Waxaa la cusbooneysiiyay "${formName}" (Barcode: ${finalBarcode}). Qiimaha Iibka: $${retailNum}, Soo Iibsiga: $${costNum}, Kaydka: ${qtyNum}, Digniinta: ${minAlertNum}`,
        'success'
      );
    } else {
      // Create new clean item
      const newProduct: Product = {
        id: `p_${Date.now()}`,
        name: formName.trim(),
        sku: finalSku,
        barcode: finalBarcode,
        qrCode: finalBarcode,
        category: 'Guud',
        costPrice: costNum,
        retailPrice: retailNum,
        minStockLevel: minAlertNum,
        stockOutAlert: minAlertNum,
        isEncrypted: false
      };

      onAddProduct(newProduct, qtyNum, currentWhId);

      onAddAuditLog(
        'Diiwaangelinta Alaab Cusub',
        `Waxaa la diiwaangeliyay "${formName}" (Barcode: ${finalBarcode}) tiradeeda kaydka ${qtyNum} xabbo`,
        'success'
      );
    }

    setIsItemFormOpen(false);
    setEditingProductId(null);
  };

  // Submit Receiving / Stock IN
  const handleStockInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockInProduct) return;
    const addQty = parseCleanNum(stockInQtyToAdd);
    if (addQty <= 0) {
      return;
    }

    const existingQty = getProductStock(stockInProduct.id);
    const finalQty = existingQty + addQty;

    onUpdateInventory(stockInProduct.id, currentWhId, finalQty);

    const newCost = parseCleanNum(stockInNewCost);
    const newRetail = parseCleanNum(stockInNewRetail);
    if ((newCost && newCost !== stockInProduct.costPrice) || (newRetail && newRetail !== stockInProduct.retailPrice)) {
      onUpdateProductPrices(
        stockInProduct.id,
        newCost || stockInProduct.costPrice,
        newRetail || stockInProduct.retailPrice,
        stockInProduct.minStockLevel
      );
    }

    onAddAuditLog(
      'Soo Galinta Kaydka (Stock IN)',
      `Waxaa lagu daray ${addQty} xabbo alaabta "${stockInProduct.name}". Wadarta hadda: ${finalQty}`,
      'success'
    );

    setStockInProduct(null);
    setStockInQtyToAdd('10');
  };

  // Execute deletion safely without window.confirm
  const handleConfirmDelete = () => {
    if (!productToDelete || !onDeleteProduct) return;
    const targetId = productToDelete.id;
    const targetName = productToDelete.name;

    // Call deletion prop
    onDeleteProduct(targetId);

    // Call direct backend deletion route
    fetch(`/api/db/product/bulaale/${encodeURIComponent(targetId)}`, { method: 'DELETE' }).catch(() => {});

    onAddAuditLog('Tirtiridda Alaabta', `Waxaa nidaamka laga tirtiray "${targetName}".`, 'warning');
    setProductToDelete(null);
  };

  // Filter products for clean table
  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  });

  // Calculate live profit margin for the form
  const parsedCost = Number(formCostPrice) || 0;
  const parsedRetail = Number(formRetailPrice) || 0;
  const unitProfit = Math.max(0, parsedRetail - parsedCost);
  const profitMarginPercent = parsedRetail > 0 ? ((unitProfit / parsedRetail) * 100).toFixed(1) : '0';

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 dark:bg-slate-950 overflow-hidden text-slate-900 dark:text-slate-100 font-sans text-left" dir="ltr">
      
      {/* TOP CLEAN HEADER */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm md:text-base font-bold font-display text-slate-900 dark:text-white">
              Bakhaarka & Alaabta
            </h2>
            <p className="text-[11px] text-slate-500">Diiwaanka alaabta, qiimaha, iyo xadka digniinta</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Import from Excel (Gemini AI) */}
          <button
            type="button"
            onClick={() => setIsExcelImportOpen(true)}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
            title="Soo Geli Fayl Excel ah adoo adeegsanaya Google Gemini AI"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Soo Geli Excel (AI)</span>
            <span className="sm:hidden">Excel</span>
          </button>

          {/* Scanner Button */}
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Camera className="w-3.5 h-3.5 text-blue-600" />
            <span>Kamera Baar</span>
          </button>

          {/* New Item Button */}
          <button
            type="button"
            onClick={() => openItemForm(null)}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Alaab Cusub</span>
          </button>
        </div>
      </div>

      {/* SEARCH ROW */}
      <div className="px-4 md:px-6 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Raadi magaca ama baarkoodhka..."
            className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
          />
        </div>

        <div className="text-xs text-slate-500 font-mono">
          <span>Wadarta: </span>
          <span className="font-bold text-slate-900 dark:text-white">{products.length} alaab</span>
        </div>
      </div>

      {/* CLEAN INVENTORY TABLE */}
      <div className="flex-1 overflow-auto bg-white dark:bg-slate-950">
        <table className="w-full text-left border-collapse border-b border-slate-200 dark:border-slate-800 text-xs" dir="ltr">
          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-black uppercase border-b border-slate-300 dark:border-slate-800 select-none">
            <tr>
              <th className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center w-10">#</th>
              <th className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 w-36 font-mono">Baarkoodhka</th>
              <th className="px-4 py-2.5 border-r border-slate-200 dark:border-slate-800">Magaca Alaabta</th>
              <th className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center w-24">Kaydka</th>
              <th className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-right w-24">Qiimaha Soo Iibka</th>
              <th className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-right w-24">Qiimaha Iibka</th>
              <th className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center w-28">Low Alert</th>
              <th className="px-3 py-2.5 text-center w-28">Hawlaha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                  <Boxes className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-semibold">Wax alaab ah lagama helin</p>
                </td>
              </tr>
            ) : (
              filteredProducts.map((p, idx) => {
                const qtyOnHand = getProductStock(p.id);
                const minAlert = p.minStockLevel || 5;
                const isLow = qtyOnHand <= minAlert;

                return (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors">
                    <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center text-slate-400 font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 font-mono text-slate-600 dark:text-slate-300 text-[11px]">
                      {p.barcode || '-'}
                    </td>
                    <td className="px-4 py-2.5 border-r border-slate-200 dark:border-slate-800">
                      <span className="font-bold text-slate-900 dark:text-white block">{p.name}</span>
                    </td>
                    <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center font-mono">
                      <span className={`px-2 py-0.5 rounded font-black text-xs ${
                        isLow 
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                          : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                      }`}>
                        {qtyOnHand}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-right font-mono text-slate-700 dark:text-slate-300">
                      ${p.costPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      ${p.retailPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center font-mono text-slate-600 dark:text-slate-400">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px]">
                        ≤ {minAlert}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Quick Stock In */}
                        <button
                          type="button"
                          onClick={() => {
                            setStockInProduct(p);
                            setStockInNewCost(p.costPrice.toString());
                            setStockInNewRetail(p.retailPrice.toString());
                            setStockInQtyToAdd('10');
                          }}
                          className="px-2 py-1 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold cursor-pointer transition-colors"
                          title="Soo Geli Kayd"
                        >
                          +Kayd
                        </button>

                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => openItemForm(p)}
                          className="p-1 text-slate-500 hover:text-blue-600 cursor-pointer"
                          title="Wax ka beddel"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete - In-App Confirmation */}
                        {onDeleteProduct && (
                          <button
                            type="button"
                            onClick={() => setProductToDelete(p)}
                            className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            title="Tirtir"
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

      {/* CLEAN ITEM FORM MODAL (ONLY BAARKOODHKA, NAME, PRICES, QTY, AND LOW ALERT) */}
      {isItemFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs" dir="ltr">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
            
            <div className="bg-slate-100 dark:bg-slate-950 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-emerald-600" />
                <span>{editingProductId ? 'Wax ka beddelka Alaabta' : 'Diiwaangelinta Alaab Cusub'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsItemFormOpen(false)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleItemFormSubmit} className="p-4 space-y-3.5">
              
              {/* Product Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Magaca Alaabta *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="tusaale: Caano Geel 1L, Bariis 25kg..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Barcode Only (No SKU, No QR code field) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Baarkoodhka (Barcode) *
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoGenerateBarcode}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                  >
                    <Barcode className="w-3 h-3" /> Auto Barcode
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={formBarcode}
                  onChange={(e) => setFormBarcode(e.target.value)}
                  placeholder="Koodhka baarkoodhka..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Qiimaha Soo Iibsiga ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formCostPrice}
                    onChange={(e) => setFormCostPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Qiimaha Iibka ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formRetailPrice}
                    onChange={(e) => setFormRetailPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-emerald-600"
                  />
                </div>
              </div>

              {/* Quantity and Low Stock Alert (Only low alert kept as requested) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tirada Hadda (Qty) *
                  </label>
                  <input
                    type="number"
                    required
                    value={formInitialQty}
                    onChange={(e) => setFormInitialQty(e.target.value)}
                    placeholder="10"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-600 dark:text-amber-400 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Xadka Digniinta (Low Alert) *</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formLowStockAlert}
                    onChange={(e) => setFormLowStockAlert(e.target.value)}
                    placeholder="5"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>

              {/* Profit preview banner */}
              {parsedRetail > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs flex justify-between items-center font-mono">
                  <span className="text-slate-500 font-sans">Faa'iidada xabbad kasta:</span>
                  <span className="font-bold text-emerald-600">
                    +${unitProfit.toFixed(2)} ({profitMarginPercent}%)
                  </span>
                </div>
              )}

              {/* Buttons */}
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsItemFormOpen(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Ka Noqo
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm transition-colors"
                >
                  Kaydi
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* RECEIVING / STOCK IN MODAL */}
      {stockInProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs" dir="ltr">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            
            <div className="bg-slate-100 dark:bg-slate-950 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-emerald-600" />
                <span>Soo Galinta Kaydka (Stock IN)</span>
              </h3>
              <button
                type="button"
                onClick={() => setStockInProduct(null)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleStockInSubmit} className="p-4 space-y-3.5">
              
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                  {stockInProduct.name}
                </h4>
                <span className="text-[11px] text-slate-500 font-mono block mt-0.5">
                  Baarkoodh: #{stockInProduct.barcode || '-'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tirada Cusub ee La Soo Geliyay *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={stockInQtyToAdd}
                  onChange={(e) => setStockInQtyToAdd(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-base font-mono font-black text-emerald-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Qiimaha Soo Iibsiga ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={stockInNewCost}
                    onChange={(e) => setStockInNewCost(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Qiimaha Iibka ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={stockInNewRetail}
                    onChange={(e) => setStockInNewRetail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-emerald-600"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setStockInProduct(null)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Ka Noqo
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm"
                >
                  Xaqiiji
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* IN-APP SAFE DELETION CONFIRMATION MODAL (Solves window.confirm iframe bug) */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs" dir="ltr">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Tirtiridda Alaabta
              </h3>
              <p className="text-xs text-slate-500">
                Ma hubtaa inaad gabi ahaanba tirtirto alaabta <span className="font-bold text-slate-800 dark:text-slate-200">"{productToDelete.name}"</span>?
              </p>
              {productToDelete.barcode && (
                <span className="text-[11px] font-mono text-slate-400 block">
                  Baarkoodh: #{productToDelete.barcode}
                </span>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="flex-1 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Ka Noqo
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
              >
                Haa, Tirtir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INVENTORY SCANNER MODAL */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        products={products}
        scannerMode="in"
        onScanSuccess={(code, matched) => {
          setIsScannerOpen(false);
          if (matched) {
            setStockInProduct(matched);
            setStockInNewCost(matched.costPrice.toString());
            setStockInNewRetail(matched.retailPrice.toString());
            setStockInQtyToAdd('10');
          } else {
            openItemForm(null, code);
          }
        }}
      />

      {/* GEMINI AI POWERED EXCEL / CSV IMPORT MODAL */}
      {isExcelImportOpen && (
        <ExcelImportModal
          isOpen={isExcelImportOpen}
          onClose={() => setIsExcelImportOpen(false)}
          products={products}
          inventory={inventory}
          warehouses={warehouses}
          onCommitImport={(newProds, newInvs, updatedProds, summaryMsg) => {
            if (onBatchImportProducts) {
              onBatchImportProducts(newProds, newInvs, updatedProds, summaryMsg);
            } else {
              // Fallback: update sequentially
              newProds.forEach(p => {
                const invItem = newInvs.find(i => i.productId === p.id);
                onAddProduct(p, invItem ? invItem.quantityOnHand : 0, invItem?.warehouse || warehouses[0]?.id || 'w_1');
              });
              updatedProds.forEach(p => {
                onUpdateProductPrices(p.id, p.costPrice, p.retailPrice, p.minStockLevel, p.category);
                const invItem = newInvs.find(i => i.productId === p.id);
                if (invItem) {
                  onUpdateInventory(p.id, invItem.warehouse, invItem.quantityOnHand);
                }
              });
              onAddAuditLog('Soo Gelinta Excel', summaryMsg, 'success');
            }
          }}
        />
      )}

    </div>
  );
}
