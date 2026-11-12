/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Product, InventoryItem, Warehouse } from '../types';
import { 
  FileSpreadsheet, UploadCloud, CheckCircle2, 
  Download, X, Check, RefreshCw, SlidersHorizontal,
  Search, AlertCircle
} from 'lucide-react';
import { generateEan13Barcode } from '../lib/barcodeScanner';

export interface ColumnMapping {
  name?: string;
  barcode?: string;
  costPrice?: string;
  retailPrice?: string;
  quantityOnHand?: string;
  category?: string;
  sku?: string;
  minStockLevel?: string;
  description?: string;
}

export interface AnalyzedRow {
  rowIndex: number;
  raw: Record<string, any>;
  name: string;
  barcode: string;
  costPrice: number;
  retailPrice: number;
  quantityOnHand: number;
  category: string;
  sku: string;
  minStockLevel: number;
  description: string;
  status: 'new' | 'update' | 'skip' | 'error';
  matchedProductId?: string;
  errorReason?: string;
}

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  inventory: InventoryItem[];
  warehouses: Warehouse[];
  onCommitImport: (
    newProducts: Product[],
    inventoryItems: InventoryItem[],
    updatedProducts: Product[],
    auditSummary: string
  ) => void;
}

// Arabic-aware text normalizer
function normArabic(s: any): string {
  return String(s || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '') // Tashkeel / Harakat
    .replace(/\u0640/g, '') // Tatweel
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]/g, '');
}

// Intelligent number & price parser
export function parseSmartPrice(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  
  let s = String(val).trim();
  if (!s) return 0;

  // Convert Arabic-Indic and Persian digits
  const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  const persianDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  arabicDigits.forEach((d, i) => { s = s.replaceAll(d, String(i)); });
  persianDigits.forEach((d, i) => { s = s.replaceAll(d, String(i)); });

  // Replace Arabic decimal mark (U+066B) with '.'
  s = s.replace(/[\u066B]/g, '.');
  // Remove Arabic thousands separator (U+066C)
  s = s.replace(/[\u066C]/g, '');

  // Strip currency words, symbols, and non-numeric chars except digits, comma, period, minus
  s = s.replace(/[^0-9.,\-]/g, '').trim();
  if (!s) return 0;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot !== -1 && lastComma !== -1) {
    if (lastDot > lastComma) {
      // 1,250.50 -> comma is thousand, dot is decimal
      s = s.replace(/,/g, '');
    } else {
      // 1.250,50 -> dot is thousand, comma is decimal
      s = s.replace(/\./g, '').replace(/,/g, '.');
    }
  } else if (lastComma !== -1 && lastDot === -1) {
    // Only comma exists
    const parts = s.split(',');
    if (parts.length === 2 && (parts[1].length === 1 || parts[1].length === 2)) {
      // 12,50 or 4,5 -> decimal comma
      s = s.replace(',', '.');
    } else {
      // 1,000 -> thousands separator
      s = s.replace(/,/g, '');
    }
  }

  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

// Intelligent Header Finder that handles title rows, blank lines, and offsets
function extractIntelligentRows(worksheet: XLSX.WorkSheet) {
  const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true });
  if (!rawMatrix || rawMatrix.length === 0) return { headers: [], rows: [] };

  const knownHeaderKeywords = [
    'اسم', 'منتج', 'صنف', 'مادة', 'name', 'product', 'item', 'magac', 'alaab',
    'سعر', 'بيع', 'شراء', 'تكلفة', 'تكلفه', 'ثمن', 'مبلغ', 'قيمة', 'price', 'cost', 'retail', 'sell', 'buy', 'qiimo', 'iib',
    'باركود', 'كود', 'رمز', 'barcode', 'ean', 'upc', 'sku', 'barkoodh',
    'كمية', 'كميه', 'عدد', 'مخزون', 'رصيد', 'qty', 'quantity', 'stock', 'count', 'tirada', 'kayd',
    'قسم', 'تصنيف', 'فئة', 'نوع', 'category', 'dept', 'qayb'
  ];

  let bestHeaderRowIndex = 0;
  let maxScore = -1;

  for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
    const row = rawMatrix[r];
    if (!Array.isArray(row)) continue;

    let score = 0;
    row.forEach(cell => {
      const val = normArabic(cell);
      if (val && knownHeaderKeywords.some(kw => val.includes(kw))) {
        score += 2;
      } else if (val && typeof cell === 'string' && isNaN(Number(val))) {
        score += 1;
      }
    });

    if (score > maxScore) {
      maxScore = score;
      bestHeaderRowIndex = r;
    }
  }

  // Extract clean headers
  const headerRow = rawMatrix[bestHeaderRowIndex] || [];
  const cleanHeaders: string[] = [];
  const headerCounts: Record<string, number> = {};

  headerRow.forEach((cell, idx) => {
    let name = String(cell || '').trim();
    if (!name) name = 'Tiir_' + (idx + 1);
    // ensure unique
    if (headerCounts[name]) {
      headerCounts[name]++;
      name = name + '_' + headerCounts[name];
    } else {
      headerCounts[name] = 1;
    }
    cleanHeaders.push(name);
  });

  // Extract data rows
  const rows: Record<string, any>[] = [];
  for (let r = bestHeaderRowIndex + 1; r < rawMatrix.length; r++) {
    const rowData = rawMatrix[r];
    if (!Array.isArray(rowData)) continue;
    const hasData = rowData.some(c => c !== '' && c !== null && c !== undefined);
    if (!hasData) continue;

    const rowObj: Record<string, any> = {};
    cleanHeaders.forEach((h, colIdx) => {
      rowObj[h] = rowData[colIdx] !== undefined ? rowData[colIdx] : '';
    });
    rows.push(rowObj);
  }

  return { headers: cleanHeaders, rows };
}

// Arabic, Somali & English smart column matcher
function autoDetectColumnsSmart(colHeaders: string[]): ColumnMapping {
  const detected: ColumnMapping = {};
  const normHeaders = colHeaders.map(h => ({ raw: h, norm: normArabic(h) }));

  const findMatch = (keywords: string[], exclude: string[] = []): string | undefined => {
    for (const item of normHeaders) {
      if (exclude.includes(item.raw)) continue;
      for (const kw of keywords) {
        const normKw = normArabic(kw);
        if (item.norm === normKw || item.norm.includes(normKw)) {
          return item.raw;
        }
      }
    }
    return undefined;
  };

  // 1. Name
  detected.name = findMatch([
    'اسم المنتج', 'اسم الصنف', 'المنتج', 'الصنف', 'المادة', 'اسم', 'الوصف', 'بيان',
    'product name', 'item name', 'product', 'item', 'title', 'magaca alaabta', 'magac', 'alaab'
  ]) || colHeaders[0];

  // 2. Barcode
  detected.barcode = findMatch([
    'باركود', 'الباركود', 'كود الصنف', 'رمز الصنف', 'رقم الباركود', 'باركود الصنف', 'كود', 'الكود', 'رمز', 'الرمز',
    'barcode', 'bar code', 'ean', 'ean13', 'upc', 'barkoodh', 'barkoodhka', 'koodh'
  ], [detected.name || '']);

  // 3. Purchase / Cost Price (explicit keywords)
  const costKeywords = [
    'سعر الشراء', 'سعر شراء', 'سعر التكلفة', 'سعر التكلفه', 'سعر الكلفة', 'التكلفة', 'التكلفه',
    'شراء', 'الشراء', 'تكلفة', 'تكلفه', 'كلفة', 'ثمن الشراء', 'قيمة الشراء', 'سعر جملة', 'الجملة',
    'cost price', 'cost', 'purchase price', 'purchase', 'buy price', 'buy', 'qiimaha sooiibsiga', 'sooiib'
  ];
  detected.costPrice = findMatch(costKeywords, [detected.name || '', detected.barcode || '']);

  // 4. Retail / Selling Price (explicit keywords)
  const retailKeywords = [
    'سعر البيع', 'سعر بيع', 'سعر المفرد', 'سعر التجزئة', 'سعر التجزئه', 'سعر القطعة', 'سعر القطعه',
    'سعر الوحده', 'سعر الوحدة', 'سعر المستهلك', 'سعر الجمهور', 'بيع', 'البيع', 'تجزئة', 'مفرد', 'قطاعي',
    'retail price', 'selling price', 'sell price', 'sale price', 'unit price', 'rate', 'qiimaha iibka'
  ];
  detected.retailPrice = findMatch(retailKeywords, [detected.name || '', detected.barcode || '', detected.costPrice || '']);

  // If retailPrice not found, match generic 'السعر', 'سعر', 'price', 'qiimo'
  if (!detected.retailPrice) {
    const genericPrice = findMatch(
      ['السعر', 'سعر', 'price', 'qiimo', 'qiimaha', 'الثمن', 'ثمن', 'القيمة', 'المبلغ'],
      [detected.name || '', detected.barcode || '', detected.costPrice || '']
    );
    if (genericPrice) {
      detected.retailPrice = genericPrice;
    }
  }

  // If costPrice not found and multiple price columns exist, find alternative price
  if (!detected.costPrice && detected.retailPrice) {
    const altCost = findMatch(
      ['التكلفة', 'تكلفة', 'تكلفه', 'شراء', 'جملة', 'cost', 'buy'],
      [detected.name || '', detected.barcode || '', detected.retailPrice]
    );
    if (altCost) detected.costPrice = altCost;
  }

  // 5. Quantity on Hand
  detected.quantityOnHand = findMatch([
    'الكمية', 'الكميه', 'كمية', 'كميه', 'المخزون', 'مخزون', 'الرصيد', 'رصيد', 'العدد', 'عدد', 'المتوفر',
    'qty', 'quantity', 'stock', 'on hand', 'onhand', 'balance', 'count', 'tirada', 'kaydka'
  ], [detected.name || '', detected.barcode || '', detected.costPrice || '', detected.retailPrice || '']);

  // 6. Category
  detected.category = findMatch([
    'القسم', 'قسم', 'التصنيف', 'تصنيف', 'الفئة', 'فئة', 'النوع', 'نوع', 'المجموعة',
    'category', 'dept', 'department', 'group', 'qayb', 'qaybta'
  ], [detected.name || '', detected.barcode || '', detected.costPrice || '', detected.retailPrice || '', detected.quantityOnHand || '']);

  // 7. SKU
  detected.sku = findMatch([
    'sku', 'item code', 'itemcode', 'model', 'part', 'رمز الصنف', 'كود المنتج'
  ], [detected.name || '', detected.barcode || '']);

  return detected;
}

export function ExcelImportModal({
  isOpen,
  onClose,
  products,
  inventory,
  warehouses,
  onCommitImport
}: ExcelImportModalProps) {
  // File details
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [sheetsList, setSheetsList] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [rawWorkbook, setRawWorkbook] = useState<XLSX.WorkBook | null>(null);

  // Extracted data
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);

  // Column Mapping
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [showMappingEditor, setShowMappingEditor] = useState(false);

  // Price & Stock fallbacks
  const [copyRetailToCostIfZero, setCopyRetailToCostIfZero] = useState(true);
  const [defaultStockIfEmpty, setDefaultStockIfEmpty] = useState<number>(0);

  // Import options
  const [existingProductAction, setExistingProductAction] = useState<'update' | 'skip'>('update');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(warehouses[0]?.id || 'w_1');
  const [autoGenMissingBarcodes, setAutoGenMissingBarcodes] = useState(true);
  const defaultCategory = 'Guud';

  // Preview filtering & search
  const [previewFilter, setPreviewFilter] = useState<'all' | 'new' | 'update' | 'error'>('all');
  const [previewSearch, setPreviewSearch] = useState('');

  // Execution state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [finalReport, setFinalReport] = useState<{
    addedCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    errorRows: AnalyzedRow[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Background refinement
  const refineWithAiInBackground = async (colHeaders: string[], rowsData: any[]) => {
    try {
      const sample = rowsData.slice(0, 5);
      const res = await fetch('/api/gemini/analyze-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers: colHeaders,
          sampleRows: sample,
          totalRows: rowsData.length
        })
      });
      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      let data: any = {};
      if (contentType.includes('application/json') || text.trim().startsWith('{')) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }
      if (data.success && data.columnMapping && data.columnMapping.name) {
        setMapping(prev => ({
          ...prev,
          ...data.columnMapping
        }));
      }
    } catch {
      // Quiet fallback
    }
  };

  const processSelectedFile = async (file: File) => {
    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + ' KB');
    setIsCompleted(false);
    setFinalReport(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      setRawWorkbook(workbook);

      const sheetNames = workbook.SheetNames || [];
      setSheetsList(sheetNames);
      const activeSheetName = sheetNames[0] || '';
      setSelectedSheet(activeSheetName);

      loadSheetData(workbook, activeSheetName);
    } catch (err: any) {
      console.error('Failed to parse Excel file:', err);
    }
  };

  const loadSheetData = (workbook: XLSX.WorkBook, sheetName: string) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;

    // Use intelligent row extractor to bypass title rows or blank lines
    const { headers: cleanHeaders, rows: parsedRows } = extractIntelligentRows(worksheet);
    if (!parsedRows || parsedRows.length === 0) return;

    setHeaders(cleanHeaders);
    setRawRows(parsedRows);

    // 1. Instantly detect columns with Arabic & retail awareness
    const initialMapping = autoDetectColumnsSmart(cleanHeaders);
    setMapping(initialMapping);

    // 2. Refine silently with backend in background
    refineWithAiInBackground(cleanHeaders, parsedRows);
  };

  const handleSheetChange = (newSheet: string) => {
    setSelectedSheet(newSheet);
    if (rawWorkbook) {
      loadSheetData(rawWorkbook, newSheet);
    }
  };

  // Build processed products array
  const analyzedRows: AnalyzedRow[] = useMemo(() => {
    if (!rawRows || rawRows.length === 0 || !mapping.name) return [];

    const existingBarcodeMap = new Map<string, Product>();
    const existingSkuMap = new Map<string, Product>();
    const existingNameMap = new Map<string, Product>();

    products.forEach(p => {
      if (p.barcode) existingBarcodeMap.set(p.barcode.trim().toLowerCase(), p);
      if (p.sku) existingSkuMap.set(p.sku.trim().toLowerCase(), p);
      if (p.name) existingNameMap.set(p.name.trim().toLowerCase(), p);
    });

    const seenBarcodesInFile = new Set<string>();

    return rawRows.map((raw, idx) => {
      const rowName = String(mapping.name ? raw[mapping.name] : '').trim();
      const rowBarcode = String(mapping.barcode ? raw[mapping.barcode] : '').trim();
      const rawCost = mapping.costPrice ? raw[mapping.costPrice] : '';
      const rawRetail = mapping.retailPrice ? raw[mapping.retailPrice] : '';
      const rawQty = mapping.quantityOnHand ? raw[mapping.quantityOnHand] : '';
      const rawCat = mapping.category ? String(raw[mapping.category]).trim() : '';
      const rawSku = mapping.sku ? String(raw[mapping.sku]).trim() : '';
      const rawMin = mapping.minStockLevel ? raw[mapping.minStockLevel] : '';
      const rawDesc = mapping.description ? String(raw[mapping.description]).trim() : '';

      let costNum = parseSmartPrice(rawCost);
      let retailNum = parseSmartPrice(rawRetail);
      const parsedQty = mapping.quantityOnHand && rawQty !== '' ? parseSmartPrice(rawQty) : defaultStockIfEmpty;
      const qtyNum = isNaN(parsedQty) || parsedQty < 0 ? defaultStockIfEmpty : parsedQty;
      const minNum = parseSmartPrice(rawMin) || 5;

      // Smart fallback: if only one price was present in the spreadsheet
      // or if cost price is 0 and user enabled fallback
      if (costNum === 0 && copyRetailToCostIfZero && retailNum > 0) {
        costNum = retailNum;
      }
      if (retailNum === 0 && costNum > 0) {
        retailNum = costNum;
      }

      if (!rowName) {
        return {
          rowIndex: idx + 1,
          raw,
          name: '',
          barcode: rowBarcode,
          costPrice: costNum,
          retailPrice: retailNum,
          quantityOnHand: qtyNum,
          category: rawCat || defaultCategory,
          sku: rawSku,
          minStockLevel: minNum,
          description: rawDesc,
          status: 'error',
          errorReason: 'Magaca alaabta ayaa ka maqan (Missing name)'
        };
      }

      if (rowBarcode) {
        const cleanB = rowBarcode.toLowerCase();
        if (seenBarcodesInFile.has(cleanB)) {
          return {
            rowIndex: idx + 1,
            raw,
            name: rowName,
            barcode: rowBarcode,
            costPrice: costNum,
            retailPrice: retailNum,
            quantityOnHand: qtyNum,
            category: rawCat || defaultCategory,
            sku: rawSku,
            minStockLevel: minNum,
            description: rawDesc,
            status: 'error',
            errorReason: `Baarkoodhkan (${rowBarcode}) mar hore ayuu ku soo noqday faylka.`
          };
        }
        seenBarcodesInFile.add(cleanB);
      }

      // Check for existing product in POS
      let matchedProd: Product | undefined;
      if (rowBarcode) matchedProd = existingBarcodeMap.get(rowBarcode.toLowerCase());
      if (!matchedProd && rawSku) matchedProd = existingSkuMap.get(rawSku.toLowerCase());
      if (!matchedProd && rowName) matchedProd = existingNameMap.get(rowName.toLowerCase());

      if (matchedProd) {
        return {
          rowIndex: idx + 1,
          raw,
          name: rowName,
          barcode: rowBarcode || matchedProd.barcode || '',
          costPrice: costNum > 0 ? costNum : matchedProd.costPrice,
          retailPrice: retailNum > 0 ? retailNum : matchedProd.retailPrice,
          quantityOnHand: qtyNum,
          category: rawCat || matchedProd.category || defaultCategory,
          sku: rawSku || matchedProd.sku,
          minStockLevel: minNum,
          description: rawDesc || matchedProd.description || '',
          status: existingProductAction === 'update' ? 'update' : 'skip',
          matchedProductId: matchedProd.id
        };
      }

      return {
        rowIndex: idx + 1,
        raw,
        name: rowName,
        barcode: rowBarcode,
        costPrice: costNum,
        retailPrice: retailNum,
        quantityOnHand: qtyNum,
        category: rawCat || defaultCategory,
        sku: rawSku,
        minStockLevel: minNum,
        description: rawDesc,
        status: 'new'
      };
    });
  }, [rawRows, mapping, products, existingProductAction, defaultCategory, copyRetailToCostIfZero, defaultStockIfEmpty]);

  // Quick statistics
  const stats = useMemo(() => {
    let newCount = 0;
    let updateCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    analyzedRows.forEach(r => {
      if (r.status === 'new') newCount++;
      else if (r.status === 'update') updateCount++;
      else if (r.status === 'skip') skipCount++;
      else if (r.status === 'error') errorCount++;
    });

    return {
      total: analyzedRows.length,
      newCount,
      updateCount,
      skipCount,
      errorCount
    };
  }, [analyzedRows]);

  // Filtered rows for the preview table
  const filteredPreviewRows = useMemo(() => {
    return analyzedRows.filter(r => {
      if (previewFilter !== 'all' && r.status !== previewFilter) return false;
      if (!previewSearch) return true;
      const q = previewSearch.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.barcode.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      );
    });
  }, [analyzedRows, previewFilter, previewSearch]);

  // Execute Import
  const handleExecuteImport = async () => {
    setIsSubmitting(true);

    try {
      const validNewRows = analyzedRows.filter(r => r.status === 'new');
      const validUpdateRows = analyzedRows.filter(r => r.status === 'update');
      const skippedRows = analyzedRows.filter(r => r.status === 'skip');
      const errorRows = analyzedRows.filter(r => r.status === 'error');

      const createdProducts: Product[] = [];
      const createdInventory: InventoryItem[] = [];
      const updatedProducts: Product[] = [];

      // Process New Products
      for (let i = 0; i < validNewRows.length; i++) {
        const row = validNewRows[i];
        const newId = 'prod_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        let barcodeToUse = row.barcode;
        if (!barcodeToUse && autoGenMissingBarcodes) {
          barcodeToUse = generateEan13Barcode('600');
        }

        const newProd: Product = {
          id: newId,
          name: row.name,
          sku: row.sku || ('SKU-' + Math.random().toString(36).substring(2, 7).toUpperCase()),
          barcode: barcodeToUse || '',
          costPrice: row.costPrice,
          retailPrice: row.retailPrice,
          minStockLevel: row.minStockLevel || 5,
          category: row.category || defaultCategory,
          description: row.description || ''
        };

        const newInv: InventoryItem = {
          id: 'inv_' + Date.now() + '_' + i,
          productId: newId,
          warehouse: selectedWarehouseId,
          quantityOnHand: row.quantityOnHand,
          lastRestockedAt: new Date().toISOString()
        };

        createdProducts.push(newProd);
        createdInventory.push(newInv);
      }

      // Process Updates
      for (const row of validUpdateRows) {
        if (!row.matchedProductId) continue;
        const origProd = products.find(p => p.id === row.matchedProductId);
        if (!origProd) continue;

        const updated: Product = {
          ...origProd,
          name: row.name || origProd.name,
          barcode: row.barcode || origProd.barcode,
          costPrice: row.costPrice > 0 ? row.costPrice : origProd.costPrice,
          retailPrice: row.retailPrice > 0 ? row.retailPrice : origProd.retailPrice,
          category: row.category || origProd.category
        };
        updatedProducts.push(updated);

        const currentInv = inventory.find(i => i.productId === origProd.id && i.warehouse === selectedWarehouseId);
        const newQty = (currentInv?.quantityOnHand || 0) + row.quantityOnHand;

        createdInventory.push({
          id: currentInv ? currentInv.id : ('inv_' + Date.now() + '_' + origProd.id),
          productId: origProd.id,
          warehouse: selectedWarehouseId,
          quantityOnHand: newQty,
          lastRestockedAt: new Date().toISOString()
        });
      }

      const summary = `Soo Gelinta Excel: +${createdProducts.length} cusub, ${updatedProducts.length} la cusbooneysiiyay, ${skippedRows.length} laga booday.`;

      onCommitImport(createdProducts, createdInventory, updatedProducts, summary);

      setFinalReport({
        addedCount: createdProducts.length,
        updatedCount: updatedProducts.length,
        skippedCount: skippedRows.length,
        errorCount: errorRows.length,
        errorRows
      });
      setIsCompleted(true);
    } catch (e) {
      console.error('Import error:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Download Sample Template
  const downloadSampleTemplate = () => {
    const sampleData = [
      {
        'Magaca Alaabta': 'Shaah Lipton 100 xabbo',
        'Baarkoodhka': '6281001234567',
        'Qiimaha Iibka': 3.75,
        'Qiimaha Soo Iibsiga': 2.50,
        'Tirada Kaydka': 50,
        'Qaybta': 'Cabitaan'
      },
      {
        'Magaca Alaabta': 'Bariis Basmati 5kg',
        'Baarkoodhka': '6281001234568',
        'Qiimaha Iibka': 18.50,
        'Qiimaha Soo Iibsiga': 15.00,
        'Tirada Kaydka': 30,
        'Qaybta': 'Cunto'
      },
      {
        'Magaca Alaabta': 'Saliid Cunto 1.5L',
        'Baarkoodhka': '6281001234569',
        'Qiimaha Iibka': 5.50,
        'Qiimaha Soo Iibsiga': 4.20,
        'Tirada Kaydka': 40,
        'Qaybta': 'Saliid'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Alaabta');
    XLSX.writeFile(wb, 'tusaale_alaabta_pos.xlsx');
  };

  // Download Error CSV Report
  const downloadErrorReport = () => {
    if (!finalReport || finalReport.errorRows.length === 0) return;
    const exportData = finalReport.errorRows.map(r => ({
      Row: r.rowIndex,
      Name: r.name,
      Barcode: r.barcode,
      RetailPrice: r.retailPrice,
      CostPrice: r.costPrice,
      Quantity: r.quantityOnHand,
      Category: r.category,
      Error: r.errorReason || 'Khalad xogta ah'
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Khaladaadka');
    XLSX.writeFile(wb, `khaladaadka_excel_${Date.now()}.csv`);
  };

  const handleResetFile = () => {
    setFileName('');
    setFileSize('');
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setIsCompleted(false);
    setFinalReport(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-xs font-sans text-slate-900 dark:text-slate-100" dir="ltr">
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls, .csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) processSelectedFile(f);
          }}
        />

        {/* HEADER */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-950 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                Soo Geli Excel / CSV
              </h3>
              <p className="text-[11px] text-slate-500">
                Hubi oo soo geli alaabta iyo qiimaha saxda ah
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadSampleTemplate}
              className="text-[11px] text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors flex items-center gap-1 cursor-pointer"
              title="Degso fayl tusaale ah"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tusaale Template</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* SCREEN 1: DROPZONE */}
          {!fileName && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) processSelectedFile(file);
              }}
              className="border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-10 sm:p-14 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-900/30 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10 flex flex-col items-center justify-center gap-3 my-4"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900 dark:text-white block">
                  Dooro ama halkan ku soo tuur faylkaaga Excel / CSV
                </span>
                <span className="text-xs text-slate-500 mt-1 block">
                  Faylasha la taageero: <strong className="font-mono text-slate-700 dark:text-slate-300">.xlsx, .xls, .csv</strong>
                </span>
              </div>
              <span className="mt-1 px-3.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-lg shadow-xs hover:border-emerald-400">
                Guji Si Aad U Xulato Fayl
              </span>
            </div>
          )}

          {/* SCREEN 2: PREVIEW & DIRECT PRICE MAPPING */}
          {fileName && !isCompleted && (
            <>
              {/* TOP BAR: File Info & Quick Stat Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                
                {/* File chip */}
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-xs">
                    {fileName}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">({fileSize})</span>
                  {sheetsList.length > 1 && (
                    <select
                      value={selectedSheet}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="px-2 py-0.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-xs font-semibold"
                    >
                      {sheetsList.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={handleResetFile}
                    className="text-[11px] text-red-500 hover:underline font-semibold ml-1 cursor-pointer"
                  >
                    Beddel Faylka
                  </button>
                </div>

                {/* Stat Badges */}
                <div className="flex items-center gap-1.5">
                  <span className="px-2.5 py-0.5 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">
                    {stats.total} Guud
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    +{stats.newCount} Cusub
                  </span>
                  {stats.updateCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {stats.updateCount} Cusbooneysiin
                    </span>
                  )}
                  {stats.errorCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-md bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 font-mono font-bold text-red-600 dark:text-red-400">
                      {stats.errorCount} Khalad
                    </span>
                  )}
                </div>

              </div>

              {/* DEDICATED PRICE & STOCK MAPPING STRIP */}
              <div className="p-2.5 bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  
                  {/* Selling Price Dropdown */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>Qiimaha Iibka:</span>
                    </span>
                    <select
                      value={mapping.retailPrice || ''}
                      onChange={(e) => setMapping({ ...mapping, retailPrice: e.target.value })}
                      className="px-2 py-1 bg-white dark:bg-slate-900 border border-emerald-400 dark:border-emerald-700 rounded-lg text-xs font-bold text-emerald-700 dark:text-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">-- Dooro Tiirka --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {/* Purchase Price Dropdown */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      <span>Qiimaha Soo Iibsiga:</span>
                    </span>
                    <select
                      value={mapping.costPrice || ''}
                      onChange={(e) => setMapping({ ...mapping, costPrice: e.target.value })}
                      className="px-2 py-1 bg-white dark:bg-slate-900 border border-blue-400 dark:border-blue-700 rounded-lg text-xs font-bold text-blue-700 dark:text-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">-- Ma Jiro (Default 0) --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  {/* Stock Quantity Dropdown */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>Tirada Kaydka:</span>
                    </span>
                    <select
                      value={mapping.quantityOnHand || ''}
                      onChange={(e) => setMapping({ ...mapping, quantityOnHand: e.target.value })}
                      className="px-2 py-1 bg-white dark:bg-slate-900 border border-amber-400 dark:border-amber-700 rounded-lg text-xs font-bold text-amber-700 dark:text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">-- Ma Jiro (Tiro Hordhac ah) --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    {!mapping.quantityOnHand && (
                      <div className="flex items-center gap-1 text-[11px] bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700">
                        <span className="text-amber-800 dark:text-amber-300 font-semibold">Tirada:</span>
                        <input
                          type="number"
                          min="0"
                          value={defaultStockIfEmpty}
                          onChange={(e) => setDefaultStockIfEmpty(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-12 px-1 py-0.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded text-xs font-mono font-bold text-center"
                          title="Tirada kaydka haddii tiirka tiradu maqan yahay"
                        />
                      </div>
                    )}
                  </div>

                  {/* Copy option if cost missing */}
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 select-none">
                    <input
                      type="checkbox"
                      checked={copyRetailToCostIfZero}
                      onChange={(e) => setCopyRetailToCostIfZero(e.target.checked)}
                      className="rounded text-emerald-600 w-3.5 h-3.5"
                    />
                    <span>Haddii qiimaha soo iibsigu eber yahay, isticmaal qiimaha iibka</span>
                  </label>

                </div>

                {/* More Columns Toggle */}
                <button
                  type="button"
                  onClick={() => setShowMappingEditor(!showMappingEditor)}
                  className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>{showMappingEditor ? 'Qari Tiirarka Kale' : 'Tiirarka Kale (Magac, Barcode...)'}</span>
                </button>
              </div>

              {/* EXPANDABLE OTHER COLUMNS DRAWER */}
              {showMappingEditor && (
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-2 animate-in fade-in duration-100">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Isku Xirka Tiirarka Kale (Column Mapping)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMappingEditor(false)}
                      className="text-slate-400 hover:text-slate-600 text-[11px]"
                    >
                      Xir
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Magaca Alaabta (Name) *</label>
                      <select
                        value={mapping.name || ''}
                        onChange={(e) => setMapping({ ...mapping, name: e.target.value })}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-xs"
                      >
                        <option value="">-- Dooro --</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Baarkoodhka (Barcode)</label>
                      <select
                        value={mapping.barcode || ''}
                        onChange={(e) => setMapping({ ...mapping, barcode: e.target.value })}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-xs"
                      >
                        <option value="">-- Auto EAN-13 --</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Qaybta (Category)</label>
                      <select
                        value={mapping.category || ''}
                        onChange={(e) => setMapping({ ...mapping, category: e.target.value })}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-xs"
                      >
                        <option value="">-- Default Guud --</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">SKU (Koodhka Gaarka ah)</label>
                      <select
                        value={mapping.sku || ''}
                        onChange={(e) => setMapping({ ...mapping, sku: e.target.value })}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded text-xs"
                      >
                        <option value="">-- Auto --</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* QUICK CONTROLS: Warehouse, Existing Product Rule & Search */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold focus:outline-none"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>

                  <select
                    value={existingProductAction}
                    onChange={(e: any) => setExistingProductAction(e.target.value)}
                    className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold focus:outline-none"
                  >
                    <option value="update">Haddii uu jiro: Cusbooneysii</option>
                    <option value="skip">Haddii uu jiro: Ka bood</option>
                  </select>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                  <input
                    type="text"
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    placeholder="Raadi alaabta..."
                    className="pl-7 pr-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium focus:outline-none w-40 sm:w-52"
                  />
                </div>
              </div>

              {/* PREVIEW TABLE */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[340px] overflow-y-auto bg-white dark:bg-slate-950 shadow-inner">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 z-10">
                    <tr>
                      <th className="p-2 text-center w-10">#</th>
                      <th className="p-2 w-20">Xaaladda</th>
                      <th className="p-2">Magaca Alaabta</th>
                      <th className="p-2 w-28 font-mono">Baarkoodh</th>
                      <th className="p-2 text-right w-24 font-mono text-emerald-700 dark:text-emerald-400">Qiimaha Iibka</th>
                      <th className="p-2 text-right w-24 font-mono text-blue-700 dark:text-blue-400">Qiimaha Soo Iibsiga</th>
                      <th className="p-2 text-center w-20 font-mono text-amber-700 dark:text-amber-400">Tirada Kaydka</th>
                      <th className="p-2 w-24">Qaybta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                    {filteredPreviewRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400">
                          Alaab lagama helin xogtan.
                        </td>
                      </tr>
                    ) : (
                      filteredPreviewRows.map((row) => (
                        <tr key={row.rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors">
                          <td className="p-2 text-center text-slate-400 font-mono text-[11px]">{row.rowIndex}</td>
                          <td className="p-2">
                            {row.status === 'new' && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[9px]">
                                CUSUB
                              </span>
                            )}
                            {row.status === 'update' && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[9px]">
                                UPDATE
                              </span>
                            )}
                            {row.status === 'skip' && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold text-[9px]">
                                SKIP
                              </span>
                            )}
                            {row.status === 'error' && (
                              <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-bold text-[9px]" title={row.errorReason}>
                                KHALAD
                              </span>
                            )}
                          </td>
                          <td className="p-2 font-bold text-slate-900 dark:text-white truncate max-w-[220px]">
                            {row.name || <span className="text-red-500 italic">Maran</span>}
                            {row.errorReason && (
                              <span className="block text-[9px] text-red-500 font-normal truncate">
                                {row.errorReason}
                              </span>
                            )}
                          </td>
                          <td className="p-2 font-mono text-slate-600 dark:text-slate-300 text-[11px]">
                            {row.barcode || <span className="text-slate-400 italic font-sans text-[9px]">Auto EAN</span>}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            ${row.retailPrice.toFixed(2)}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                            ${row.costPrice.toFixed(2)}
                          </td>
                          <td className="p-2 text-center font-mono">
                            <span className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                              row.quantityOnHand > 0 
                                ? 'bg-amber-100/70 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' 
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                            }`}>
                              {row.quantityOnHand}
                            </span>
                          </td>
                          <td className="p-2 text-slate-500 text-[11px] truncate max-w-[100px]">
                            {row.category}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* SCREEN 3: SUCCESS RESULT */}
          {isCompleted && finalReport && (
            <div className="py-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Alaabta Si Guul Ah Ayaa Loo Soo Geliyay!
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kaydka iyo qiimaha POS-ka si toos ah ayaa loo cusbooneysiiyay.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 max-w-sm mx-auto text-xs">
                <div className="flex-1 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold block">Cusub</span>
                  <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">+{finalReport.addedCount}</span>
                </div>
                <div className="flex-1 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                  <span className="text-[10px] text-blue-700 dark:text-blue-300 font-semibold block">Cusbooneysiin</span>
                  <span className="text-base font-black font-mono text-blue-600 dark:text-blue-400">{finalReport.updatedCount}</span>
                </div>
                {finalReport.errorCount > 0 && (
                  <div className="flex-1 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
                    <span className="text-[10px] text-red-700 dark:text-red-300 font-semibold block">Khalad</span>
                    <span className="text-base font-black font-mono text-red-600 dark:text-red-400">{finalReport.errorCount}</span>
                  </div>
                )}
              </div>

              {finalReport.errorCount > 0 && (
                <button
                  type="button"
                  onClick={downloadErrorReport}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold flex items-center gap-1 mx-auto cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Degso Khaladaadka ({finalReport.errorCount})</span>
                </button>
              )}
            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="bg-slate-50 dark:bg-slate-900/50 px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs shrink-0">
          <div>
            {fileName && !isCompleted && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPreviewFilter('all')}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                    previewFilter === 'all' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  Dhammaan
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter('new')}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                    previewFilter === 'new' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  Cusub ({stats.newCount})
                </button>
                {stats.updateCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('update')}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                      previewFilter === 'update' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    Cusbooneysiin ({stats.updateCount})
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isCompleted ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  Ka Noqo
                </button>

                {fileName && (
                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={isSubmitting || (stats.newCount === 0 && stats.updateCount === 0)}
                    className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Waa la shubayaa...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Soo Geli ({stats.newCount + stats.updateCount} Alaab)</span>
                      </>
                    )}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold cursor-pointer"
              >
                Dhammaystir
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
