/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product } from '../types';

export type DetectedBarcodeFormat = 
  | 'EAN-13'
  | 'EAN-8'
  | 'UPC-A'
  | 'UPC-E'
  | 'Code 128'
  | 'Code 39'
  | 'QR Code'
  | 'Other';

export interface BarcodeValidationResult {
  isValid: boolean;
  format: DetectedBarcodeFormat;
  normalizedCode: string;
  errorReason?: string;
  expectedCheck?: number;
  actualCheck?: number;
}

export function mapZxingFormatToDetected(format?: any): DetectedBarcodeFormat {
  if (format === undefined || format === null) return 'Other';
  const str = String(format).toLowerCase().replace(/[\-_]/g, '');
  if (str.includes('ean13') || str === '7') return 'EAN-13';
  if (str.includes('ean8') || str === '6') return 'EAN-8';
  if (str.includes('upca') || str === '14') return 'UPC-A';
  if (str.includes('upce') || str === '15') return 'UPC-E';
  if (str.includes('code128') || str === '4') return 'Code 128';
  if (str.includes('code39') || str === '2') return 'Code 39';
  if (str.includes('qr') || str === '11') return 'QR Code';
  return 'Other';
}

/**
 * Validates a scanned barcode string against standard specifications:
 * - EAN-13: 13 digits with modulo-10 weighted check digit validation
 * - EAN-8: 8 digits with modulo-10 weighted check digit validation
 * - UPC-A: 12 digits with modulo-10 weighted check digit validation
 * - UPC-E: 6-8 digits compressed UPC
 * - Code 128 / Code 39: alphanumeric linear barcodes
 * - QR Code: 2D matrix payload (JSON, URL, or raw text)
 */
export function validateBarcode(raw: string): BarcodeValidationResult {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return {
      isValid: false,
      format: 'Other',
      normalizedCode: '',
      errorReason: 'Koodhku waa maran yahay (Barcode is empty)'
    };
  }

  // 1. JSON or URL payload indicates a QR Code
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return {
      isValid: true,
      format: 'QR Code',
      normalizedCode: trimmed
    };
  }

  const isNumericOnly = /^\d+$/.test(trimmed);

  // 2. Validate EAN-13 (13 numeric digits)
  if (isNumericOnly && trimmed.length === 13) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(trimmed[i], 10);
      sum += (i % 2 === 0) ? digit * 1 : digit * 3;
    }
    const expectedCheck = (10 - (sum % 10)) % 10;
    const actualCheck = parseInt(trimmed[12], 10);

    if (expectedCheck !== actualCheck) {
      return {
        isValid: false,
        format: 'EAN-13',
        normalizedCode: trimmed,
        expectedCheck,
        actualCheck,
        errorReason: `Koodhka EAN-13 (${trimmed}) wuu dhaawacan yahay ama lambarka xaqiijinta (Check Digit) ma saxna. Waxaa la filayay '${expectedCheck}', laakiin waxaa laga helay '${actualCheck}'.`
      };
    }

    return {
      isValid: true,
      format: 'EAN-13',
      normalizedCode: trimmed,
      expectedCheck,
      actualCheck
    };
  }

  // 3. Validate UPC-A (12 numeric digits)
  if (isNumericOnly && trimmed.length === 12) {
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      const digit = parseInt(trimmed[i], 10);
      sum += (i % 2 === 0) ? digit * 3 : digit * 1;
    }
    const expectedCheck = (10 - (sum % 10)) % 10;
    const actualCheck = parseInt(trimmed[11], 10);

    if (expectedCheck !== actualCheck) {
      return {
        isValid: false,
        format: 'UPC-A',
        normalizedCode: trimmed,
        expectedCheck,
        actualCheck,
        errorReason: `Koodhka UPC-A (${trimmed}) lambarkiisa xaqiijinta (Check Digit) ma saxna. Waxaa la filayay '${expectedCheck}', laakiin waxaa laga helay '${actualCheck}'.`
      };
    }

    return {
      isValid: true,
      format: 'UPC-A',
      normalizedCode: trimmed,
      expectedCheck,
      actualCheck
    };
  }

  // 4. Validate EAN-8 (8 numeric digits)
  if (isNumericOnly && trimmed.length === 8) {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const digit = parseInt(trimmed[i], 10);
      sum += (i % 2 === 0) ? digit * 3 : digit * 1;
    }
    const expectedCheck = (10 - (sum % 10)) % 10;
    const actualCheck = parseInt(trimmed[7], 10);

    if (expectedCheck !== actualCheck) {
      return {
        isValid: false,
        format: 'EAN-8',
        normalizedCode: trimmed,
        expectedCheck,
        actualCheck,
        errorReason: `Koodhka EAN-8 (${trimmed}) lambarka xaqiijintiisu ma saxna.`
      };
    }

    return {
      isValid: true,
      format: 'EAN-8',
      normalizedCode: trimmed,
      expectedCheck,
      actualCheck
    };
  }

  // 5. UPC-E (6 to 8 numeric digits)
  if (isNumericOnly && (trimmed.length === 6 || trimmed.length === 7)) {
    return {
      isValid: true,
      format: 'UPC-E',
      normalizedCode: trimmed
    };
  }

  // 6. Code 128 / Code 39 (Alphanumeric linear barcodes, e.g., SKU-1002, BUL-9901)
  if (/^[A-Za-z0-9\-._/ ]+$/.test(trimmed)) {
    const format = trimmed.length > 15 ? 'Code 128' : 'Code 39';
    return {
      isValid: true,
      format,
      normalizedCode: trimmed
    };
  }

  // 7. General QR Code or other 2D matrix
  return {
    isValid: true,
    format: 'QR Code',
    normalizedCode: trimmed
  };
}

/**
 * Resolves a scanned Barcode or QR Code to a matching Product in the database.
 * Handles:
 * - Multi-format linear barcodes (EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39)
 * - 2D QR Codes
 * - Cross-normalization between EAN-13 (13-digit) and UPC-A (12-digit with/without leading zero)
 * - QR Codes containing JSON payloads (e.g. {"sku":"...", "barcode":"..."})
 * - QR Codes containing URLs (extracting code parameters or path slugs)
 * - Exact and trimmed matching against barcode, qrCode, sku, and id
 */
export function resolveProductFromCode(
  rawCode: string,
  products: Product[]
): {
  product: Product | null;
  cleanCode: string;
  format: DetectedBarcodeFormat;
  isValid: boolean;
  validationError?: string;
} {
  if (!rawCode) {
    return {
      product: null,
      cleanCode: '',
      format: 'Other',
      isValid: false,
      validationError: 'Koodhku waa maran yahay (Barcode is empty).'
    };
  }

  let cleanCode = rawCode.trim();

  // 0. Immediate direct catalog lookup (ensures internal store barcodes and existing products always match exactly)
  const directMatch = products.find(p => 
    (p.barcode && p.barcode.toLowerCase() === cleanCode.toLowerCase()) ||
    (p.qrCode && p.qrCode.toLowerCase() === cleanCode.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase() === cleanCode.toLowerCase()) ||
    (p.id && p.id.toLowerCase() === cleanCode.toLowerCase())
  );
  if (directMatch) {
    return {
      product: directMatch,
      cleanCode,
      format: cleanCode.length === 13 ? 'EAN-13' : cleanCode.length === 12 ? 'UPC-A' : cleanCode.length === 8 ? 'EAN-8' : 'Other',
      isValid: true
    };
  }

  // 1. Check format & check digit validation
  const validation = validateBarcode(cleanCode);
  if (!validation.isValid) {
    return {
      product: null,
      cleanCode,
      format: validation.format,
      isValid: false,
      validationError: validation.errorReason
    };
  }

  // 2. Try parsing JSON if code starts with { and ends with } (e.g. smart QR codes)
  if (cleanCode.startsWith('{') && cleanCode.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleanCode);
      const possibleMatch = products.find(p => 
        (parsed.id && p.id === parsed.id) ||
        (parsed.barcode && p.barcode && p.barcode.toLowerCase() === String(parsed.barcode).toLowerCase().trim()) ||
        (parsed.sku && p.sku && p.sku.toLowerCase() === String(parsed.sku).toLowerCase().trim()) ||
        (parsed.qrCode && p.qrCode && p.qrCode.toLowerCase() === String(parsed.qrCode).toLowerCase().trim())
      );
      if (possibleMatch) {
        return {
          product: possibleMatch,
          cleanCode: String(parsed.barcode || parsed.sku || cleanCode).trim(),
          format: 'QR Code',
          isValid: true
        };
      }
      if (parsed.barcode || parsed.sku) {
        cleanCode = String(parsed.barcode || parsed.sku).trim();
      }
    } catch (e) {
      // Not JSON, continue with raw string
    }
  }

  // 3. Try parsing URL params if code contains http/https
  if (cleanCode.startsWith('http://') || cleanCode.startsWith('https://')) {
    try {
      const url = new URL(cleanCode);
      const paramCode = url.searchParams.get('code') || url.searchParams.get('barcode') || url.searchParams.get('sku');
      if (paramCode) {
        cleanCode = paramCode.trim();
      } else {
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length > 0) {
          cleanCode = parts[parts.length - 1].trim();
        }
      }
    } catch (e) {
      // Continue with raw string
    }
  }

  let query = cleanCode.toLowerCase();
  const cleanNumeric = query.replace(/\D/g, '');

  // Helper to normalize strings for robust comparison (stripping whitespace and hyphens)
  const norm = (val?: string) => (val || '').toLowerCase().replace(/[\s\-_]/g, '');

  // 4. Direct exact matching on Barcode, SKU, QR Code, or ID
  let match = products.find(p => 
    (p.barcode && p.barcode.toLowerCase() === query) ||
    (p.qrCode && p.qrCode.toLowerCase() === query) ||
    (p.sku && p.sku.toLowerCase() === query) ||
    (p.id && p.id.toLowerCase() === query)
  );

  if (match) {
    return {
      product: match,
      cleanCode,
      format: validation.format,
      isValid: true
    };
  }

  // 5. Normalized matching (ignoring hyphens, spaces)
  const normQuery = norm(query);
  match = products.find(p => 
    (p.barcode && norm(p.barcode) === normQuery) ||
    (p.sku && norm(p.sku) === normQuery) ||
    (p.qrCode && norm(p.qrCode) === normQuery)
  );
  if (match) {
    return { product: match, cleanCode, format: validation.format, isValid: true };
  }

  // 6. Cross-format EAN-13 <-> UPC-A normalization matching:
  // If query is 13 digits starting with '0', match 12-digit UPC-A without leading '0'
  if (cleanNumeric.length === 13 && cleanNumeric.startsWith('0')) {
    const withoutZero = cleanNumeric.slice(1);
    match = products.find(p => p.barcode && norm(p.barcode) === withoutZero);
    if (match) {
      return { product: match, cleanCode, format: validation.format, isValid: true };
    }
  }

  // If query is 12 digits, match 13-digit EAN-13 with prepended '0'
  if (cleanNumeric.length === 12) {
    const withZero = '0' + cleanNumeric;
    match = products.find(p => p.barcode && norm(p.barcode) === withZero);
    if (match) {
      return { product: match, cleanCode, format: validation.format, isValid: true };
    }
  }

  return {
    product: null,
    cleanCode,
    format: validation.format,
    isValid: true
  };
}

/**
 * High-precision, pleasant audio beep feedback for scanning events.
 */
export function playScanBeep(type: 'success' | 'warn' | 'error' = 'success') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1800, audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } else if (type === 'warn') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450, audioCtx.currentTime);
      osc.frequency.setValueAtTime(320, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    }
  } catch (e) {
    // AudioContext might be muted by browser autoplay policy
  }
}

/**
 * Generates an official, standard EAN-13 compliant barcode number.
 */
export function generateEan13Barcode(prefix: string = '600'): string {
  let code = prefix;
  for (let i = 0; i < 9; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return code + checkDigit.toString();
}

/**
 * Generates a clean QuickBooks SKU code.
 */
export function generateQuickBooksSku(category?: string): string {
  const catPrefix = category 
    ? category.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'ITM') 
    : 'SKU';
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `${catPrefix}-${randomNum}`;
}
