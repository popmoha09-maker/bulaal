/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Product, ScannerMode } from '../types';
import { 
  Camera, X, AlertCircle, ShoppingCart, Boxes, 
  SwitchCamera, RotateCw, QrCode, Flashlight, CheckCircle2, ChevronDown, ChevronUp,
  Smartphone, Focus, AlertTriangle, ZoomIn
} from 'lucide-react';
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  BinaryBitmap,
  HybridBinarizer,
  HTMLCanvasElementLuminanceSource
} from '@zxing/library';
import { 
  resolveProductFromCode, 
  playScanBeep, 
  validateBarcode, 
  DetectedBarcodeFormat,
  mapZxingFormatToDetected 
} from '../lib/barcodeScanner';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onScanSuccess: (barcodeOrCode: string, matchedProduct?: Product | null) => void;
  scannerMode?: ScannerMode;
  onToggleScannerMode?: () => void;
}

export function BarcodeScannerModal({
  isOpen,
  onClose,
  products,
  onScanSuccess,
  scannerMode = 'out',
  onToggleScannerMode
}: BarcodeScannerModalProps) {
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [validationAlert, setValidationAlert] = useState<{ message: string; rawCode?: string } | null>(null);
  const [lastScannedResult, setLastScannedResult] = useState<{ code: string; name?: string; format?: DetectedBarcodeFormat } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorchCapability, setHasTorchCapability] = useState(false);
  const [hasZoomCapability, setHasZoomCapability] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [availableZoomLevels, setAvailableZoomLevels] = useState<number[]>([1]);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [tapFocusCoords, setTapFocusCoords] = useState<{ x: number; y: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const scanLoopTimerRef = useRef<any>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const zxingReaderRef = useRef<MultiFormatReader | null>(null);
  const nativeDetectorRef = useRef<any>(null);

  // Initialize ZXing MultiFormatReader configured with all 7 requested formats + TRY_HARDER
  const getZxingReader = useCallback(() => {
    if (!zxingReaderRef.current) {
      const hints = new Map<DecodeHintType, any>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new MultiFormatReader();
      reader.setHints(hints);
      zxingReaderRef.current = reader;
    }
    return zxingReaderRef.current;
  }, []);

  const handleDetectedCode = (decodedText: string, formatHint?: string | BarcodeFormat) => {
    if (!decodedText) return;
    const cleanRaw = decodedText.trim();
    if (!cleanRaw) return;

    // Prevent duplicate bursts within 1.5 seconds
    const now = Date.now();
    if (lastScannedResult?.code === cleanRaw && now - lastScannedTimeRef.current < 1500) {
      return;
    }
    lastScannedTimeRef.current = now;

    // Validate barcode format & check digits (EAN-13, EAN-8, UPC-A, Code 128, QR Code)
    const resolved = resolveProductFromCode(cleanRaw, products);

    // If barcode is invalid or damaged (e.g. failed EAN-13 check digit validation)
    if (!resolved.isValid) {
      playScanBeep('warn');
      setValidationAlert({
        message: resolved.validationError || `Koodhka (${cleanRaw}) ma saxna ama lambarkiisa xaqiijinta ayaa qaldan.`,
        rawCode: cleanRaw
      });
      setTimeout(() => {
        setValidationAlert(null);
      }, 4500);
      return;
    }

    setValidationAlert(null);

    // Provide haptic feedback if available on device
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(60);
      } catch (e) {}
    }

    playScanBeep(resolved.product ? 'success' : 'warn');

    const detectedFormat: DetectedBarcodeFormat = resolved.format !== 'Other' 
      ? resolved.format 
      : mapZxingFormatToDetected(formatHint);

    setLastScannedResult({
      code: resolved.cleanCode,
      name: resolved.product?.name,
      format: detectedFormat
    });

    onScanSuccess(resolved.cleanCode, resolved.product);

    setTimeout(() => {
      setLastScannedResult(null);
    }, 2200);
  };

  const stopActiveScanner = () => {
    isScanningRef.current = false;
    if (scanLoopTimerRef.current) {
      clearInterval(scanLoopTimerRef.current);
      scanLoopTimerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    videoTrackRef.current = null;
    setTorchOn(false);
    setScannerStatus('idle');
  };

  // Decode a single video frame with high resolution
  const processFrame = () => {
    if (!isScanningRef.current || !videoRef.current) return;
    const video = videoRef.current;

    // Ensure video has actual frames ready
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || video.paused) {
      return;
    }

    // 1. Try Hardware-Accelerated Native BarcodeDetector if available (e.g., iOS Safari QR / Chrome)
    if (nativeDetectorRef.current) {
      try {
        nativeDetectorRef.current.detect(video).then((detected: any[]) => {
          if (detected && detected.length > 0 && isScanningRef.current) {
            const item = detected[0];
            if (item && item.rawValue) {
              handleDetectedCode(item.rawValue, item.format);
              return;
            }
          }
        }).catch(() => {});
      } catch (e) {}
    }

    // 2. High-Precision ZXing MultiFormat Decoding (Handles EAN-13, EAN-8, UPC-A, Code 128, Code 39 & QR)
    try {
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // Sample a wide horizontal region (captures full quiet margins of linear 1D barcodes and central QR codes)
      // We keep high pixel resolution without shrinking bars into blurry artifacts
      const cropWidth = Math.floor(vw * 0.92);
      const cropHeight = Math.floor(vh * 0.65);
      const startX = Math.floor((vw - cropWidth) / 2);
      const startY = Math.floor((vh - cropHeight) / 2);

      // Clamp dimensions for performance: max 1280px wide (plenty for EAN-13, zero blur)
      const targetWidth = Math.min(cropWidth, 1280);
      const targetHeight = Math.floor(cropHeight * (targetWidth / cropWidth));

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      ctx.drawImage(video, startX, startY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);

      const reader = getZxingReader();
      const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas);
      const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
      const result = reader.decode(binaryBitmap);

      if (result && result.getText()) {
        handleDetectedCode(result.getText(), result.getBarcodeFormat());
      }
    } catch (err: any) {
      // NotFoundException is standard per frame when no barcode is in view
    }
  };

  const startScanner = async (facing: 'environment' | 'user') => {
    stopActiveScanner();

    setScannerStatus('starting');
    setErrorMessage('');
    setValidationAlert(null);

    // Prepare constraints optimized for mobile Safari & high definition 1D line resolution
    const constraintsList: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      },
      {
        video: {
          facingMode: facing,
        },
        audio: false
      },
      {
        video: true,
        audio: false
      }
    ];

    let stream: MediaStream | null = null;
    let lastError: any = null;

    for (const c of constraintsList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        if (stream) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!stream) {
      console.warn('Failed to get camera stream:', lastError);
      setScannerStatus('error');
      const errStr = String(lastError?.message || lastError).toLowerCase();
      if (errStr.includes('permission') || errStr.includes('notallowed') || errStr.includes('denied')) {
        setErrorMessage('Fadlan sii fasaxa kamerada biraawsarkaaga (Safari / Chrome Settings > Camera > Allow) si aad wax ugu sawirto.');
      } else if (errStr.includes('notfound') || errStr.includes('device')) {
        setErrorMessage('Qalabkaaga lagama helin kamera shaqaynaysa.');
      } else {
        setErrorMessage('Kamerada tooska ah lama furi karo. Fadlan isticmaal badhanka "📸 Sawir Toos ah (iPhone Camera)" ama geli lambarka gacanta.');
      }
      return;
    }

    streamRef.current = stream;
    const [track] = stream.getVideoTracks();
    videoTrackRef.current = track || null;

    if (videoRef.current) {
      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.muted = true;

      try {
        await video.play();
      } catch (e) {
        console.warn('Video play error:', e);
      }
    }

    // Inspect camera hardware capabilities (Autofocus, Zoom, Torch)
    if (track) {
      try {
        const caps = (track.getCapabilities ? track.getCapabilities() : {}) as any;
        const advanced: any[] = [];

        // Continuous Autofocus
        if (caps.focusMode && caps.focusMode.includes('continuous')) {
          advanced.push({ focusMode: 'continuous' });
        }
        // Continuous Exposure
        if (caps.exposureMode && caps.exposureMode.includes('continuous')) {
          advanced.push({ exposureMode: 'continuous' });
        }

        // Torch support
        if (caps.torch) {
          setHasTorchCapability(true);
        } else {
          setHasTorchCapability(false);
        }

        // Zoom support (Essential for iPhone macro camera distance to avoid minimum focal blur)
        if (caps.zoom) {
          setHasZoomCapability(true);
          const minZ = caps.zoom.min || 1;
          const maxZ = caps.zoom.max || 1;
          const levels = [1];
          if (maxZ >= 1.5 && minZ <= 1.5) levels.push(1.5);
          if (maxZ >= 2.0 && minZ <= 2.0) levels.push(2.0);
          setAvailableZoomLevels(levels);
          setZoomLevel(levels.includes(1.5) ? 1.5 : 1);

          if (levels.includes(1.5)) {
            advanced.push({ zoom: 1.5 });
          }
        } else {
          setHasZoomCapability(false);
        }

        if (advanced.length > 0) {
          track.applyConstraints({ advanced }).catch(() => {});
        }
      } catch (e) {
        console.warn('Hardware capability notice:', e);
      }
    }

    // Try initializing BarcodeDetector for hardware-supported formats
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const supported = await (window as any).BarcodeDetector.getSupportedFormats?.() || [];
        const validFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'].filter(
          f => supported.includes(f)
        );
        if (validFormats.length > 0) {
          nativeDetectorRef.current = new (window as any).BarcodeDetector({ formats: validFormats });
        }
      } catch (e) {}
    }

    isScanningRef.current = true;
    setScannerStatus('running');

    // Run frame scan loop at ~10-12 frames per second (ideal for mobile CPU and responsive decode)
    scanLoopTimerRef.current = setInterval(() => {
      processFrame();
    }, 100);
  };

  // Direct native photo snapshot handler (Uses iPhone native camera with Apple Macro/HDR)
  const handleNativePhotoSnap = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingPhoto(true);
    setErrorMessage('');
    setValidationAlert(null);

    try {
      const imageUrl = URL.createObjectURL(file);
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image file'));
        img.src = imageUrl;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas context unavailable');

      const maxDim = 1920;
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.floor(h * (maxDim / w));
          w = maxDim;
        } else {
          w = Math.floor(w * (maxDim / h));
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      const reader = getZxingReader();
      let decodedResult: any = null;

      // Pass 1: Standard orientation
      try {
        const lum1 = new HTMLCanvasElementLuminanceSource(canvas);
        const bmp1 = new BinaryBitmap(new HybridBinarizer(lum1));
        decodedResult = reader.decode(bmp1);
      } catch (e) {}

      // Pass 2: Rotated 90 degrees (common for smartphones held in portrait or landscape)
      if (!decodedResult) {
        try {
          const rotCanvas = document.createElement('canvas');
          rotCanvas.width = h;
          rotCanvas.height = w;
          const rotCtx = rotCanvas.getContext('2d', { willReadFrequently: true });
          if (rotCtx) {
            rotCtx.translate(h / 2, w / 2);
            rotCtx.rotate(Math.PI / 2);
            rotCtx.drawImage(canvas, -w / 2, -h / 2);
            const lum2 = new HTMLCanvasElementLuminanceSource(rotCanvas);
            const bmp2 = new BinaryBitmap(new HybridBinarizer(lum2));
            decodedResult = reader.decode(bmp2);
          }
        } catch (e) {}
      }

      URL.revokeObjectURL(imageUrl);

      if (decodedResult && decodedResult.getText()) {
        handleDetectedCode(decodedResult.getText(), decodedResult.getBarcodeFormat());
      } else {
        setErrorMessage('Koodhka lagama dhex helin sawirka. Fadlan hubi inuu iftiin fiican haysto oo xarriiqaha baarkoodhku si buuxda u muuqdaan.');
        playScanBeep('error');
      }
    } catch (err: any) {
      console.warn('Scan file error:', err);
      setErrorMessage('Koodhka lagama dhex helin sawirka. Fadlan mar kale tijaabi.');
      playScanBeep('error');
    } finally {
      setIsProcessingPhoto(false);
      if (nativeCameraInputRef.current) {
        nativeCameraInputRef.current.value = '';
      }
    }
  };

  // Tap-to-focus on camera viewfinder
  const handleViewportTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setTapFocusCoords({ x, y });

    if (videoTrackRef.current) {
      try {
        videoTrackRef.current.applyConstraints({
          advanced: [{ focusMode: 'continuous' } as any]
        }).catch(() => {});
      } catch (err) {}
    }

    setTimeout(() => {
      setTapFocusCoords(null);
    }, 1200);
  };

  const toggleTorch = async () => {
    if (!videoTrackRef.current) return;
    try {
      const nextState = !torchOn;
      await videoTrackRef.current.applyConstraints({
        advanced: [{ torch: nextState } as any]
      });
      setTorchOn(nextState);
    } catch (e) {
      console.warn('Torch error:', e);
    }
  };

  const handleSetZoom = async (newZoom: number) => {
    if (!videoTrackRef.current) return;
    try {
      await videoTrackRef.current.applyConstraints({
        advanced: [{ zoom: newZoom } as any]
      });
      setZoomLevel(newZoom);
    } catch (e) {
      console.warn('Zoom error:', e);
    }
  };

  const toggleCameraFacing = async () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    await startScanner(nextFacing);
  };

  useEffect(() => {
    if (isOpen) {
      startScanner(cameraFacing);
      return () => {
        stopActiveScanner();
      };
    } else {
      stopActiveScanner();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs" dir="ltr">
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[94vh]">
        
        {/* Hidden Native Camera & File Scanner Input */}
        <input
          ref={nativeCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleNativePhotoSnap}
        />

        {/* Header Bar */}
        <div className="bg-slate-100 dark:bg-slate-900 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 font-display">
                Baaraha Koodhka (EAN-13 & QR)
              </h3>
              <p className="text-[10px] text-slate-500">Taageero Buuxda: EAN-13, EAN-8, UPC, Code 128 & QR</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Front / Back Switch */}
            <button
              type="button"
              onClick={toggleCameraFacing}
              className="p-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              title="Beddel Kamerada (Hore / Dambe)"
            >
              <SwitchCamera className="w-4 h-4 text-blue-600" />
            </button>

            {/* Torch Toggle if available */}
            {hasTorchCapability && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                  torchOn 
                    ? 'bg-amber-400 text-black border-amber-500 shadow-xs' 
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                }`}
                title="Tooshka Kamerada"
              >
                <Flashlight className="w-4 h-4" />
              </button>
            )}

            {/* Mode Switcher */}
            {onToggleScannerMode && (
              <button
                type="button"
                onClick={onToggleScannerMode}
                className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider border flex items-center gap-1 cursor-pointer transition-colors ${
                  scannerMode === 'in'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                    : 'bg-blue-600 text-white border-blue-500 shadow-xs'
                }`}
              >
                {scannerMode === 'in' ? (
                  <>
                    <Boxes className="w-3.5 h-3.5" />
                    <span>IN</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>OUT</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mode Indicator Bar */}
        <div className={`px-4 py-2 text-xs font-semibold flex items-center justify-between border-b ${
          scannerMode === 'in'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
            : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800'
        }`}>
          <span>
            {scannerMode === 'in' 
              ? '📥 Qaabka: Soo Galinta Alaabta (Diiwaangelin Kayd)'
              : '🛒 Qaabka: Iibka Tooska ah (Toos ugu dar Gaariga)'
            }
          </span>
          <div className="flex items-center gap-1.5">
            {hasZoomCapability && availableZoomLevels.length > 1 && (
              <div className="flex items-center bg-black/15 rounded-md p-0.5">
                {availableZoomLevels.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => handleSetZoom(lvl)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                      zoomLevel === lvl ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-white/20'
                    }`}
                  >
                    {lvl}x
                  </button>
                ))}
              </div>
            )}
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-black/10 font-bold">
              {cameraFacing === 'environment' ? 'Dambe (Back)' : 'Hore (Front)'}
            </span>
          </div>
        </div>

        {/* Viewport Area */}
        <div className="p-4 space-y-3 flex-1 flex flex-col justify-center">
          
          <div 
            onClick={handleViewportTap}
            className="relative bg-black rounded-2xl overflow-hidden border-2 border-blue-500/40 min-h-[300px] flex items-center justify-center shadow-inner cursor-pointer"
            title="Taabo shaashadda si aad u toosiyo focus-ka kamerada"
          >
            {/* Live Video Surface */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover max-h-[320px] rounded-xl"
            />

            {/* Tap to Focus Animated Ring */}
            {tapFocusCoords && (
              <div 
                className="absolute w-12 h-12 border-2 border-amber-400 rounded-full animate-ping pointer-events-none -translate-x-1/2 -translate-y-1/2"
                style={{ left: tapFocusCoords.x, top: tapFocusCoords.y }}
              />
            )}

            {/* Precision Laser Line Scanner Animation with Wide Aspect Ratio for 1D & 2D */}
            {scannerStatus === 'running' && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-[310px] h-[175px] border-2 border-emerald-400/80 rounded-xl relative overflow-hidden shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                  {/* Corner Guides */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-emerald-400"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-emerald-400"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-emerald-400"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-emerald-400"></div>
                  
                  {/* Animated Glowing Laser */}
                  <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_10px_#ef4444] animate-scanline"></div>
                </div>
                <div className="text-[11px] font-bold text-white/90 bg-black/60 px-3 py-1 rounded-full mt-2.5 backdrop-blur-xs flex items-center gap-1.5 shadow-md">
                  <Focus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Ku qabo 15-20cm (EAN-13 ama QR)</span>
                </div>
              </div>
            )}

            {/* Processing Native Photo Overlay */}
            {isProcessingPhoto && (
              <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2 text-white text-xs font-bold z-30">
                <RotateCw className="w-8 h-8 animate-spin text-blue-500" />
                <span>Sawirka ayaa la akhrinayaa (HD ZXing Scan)...</span>
              </div>
            )}

            {/* Barcode Validation Error Notification Banner */}
            {validationAlert && (
              <div className="absolute inset-x-3 top-3 z-30 bg-red-600 text-white p-3 rounded-xl shadow-2xl flex items-start gap-2.5 animate-shake">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-200" />
                <div className="text-left text-xs space-y-0.5">
                  <span className="font-bold block">Digniin Baarkoodh (Validation Error)</span>
                  <p className="text-[11px] opacity-95 leading-tight">{validationAlert.message}</p>
                </div>
              </div>
            )}

            {/* Last Scanned Instant Confirmation Toast */}
            {lastScannedResult && !validationAlert && (
              <div className="absolute inset-x-3 top-3 z-20 bg-emerald-600 text-white p-3 rounded-xl shadow-2xl flex items-center gap-2.5 animate-bounce">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div className="truncate text-left flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs block truncate">
                      {lastScannedResult.name || 'Baarkoodhka waa la aqoonsaday!'}
                    </span>
                    {lastScannedResult.format && (
                      <span className="px-1.5 py-0.2 bg-white/20 rounded text-[9px] font-mono uppercase font-black">
                        {lastScannedResult.format}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] opacity-90 font-mono block mt-0.5">
                    #{lastScannedResult.code}
                  </span>
                </div>
              </div>
            )}

            {scannerStatus === 'starting' && (
              <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2 text-slate-300 text-xs font-medium">
                <RotateCw className="w-7 h-7 animate-spin text-blue-500" />
                <span>Kamerada ayaa furmaysa (HD Auto-Focus)...</span>
              </div>
            )}

            {scannerStatus === 'error' && (
              <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-5 text-center space-y-3 z-10">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                <p className="text-xs font-bold text-white">Kameradu Ma Furnayso</p>
                <p className="text-[11px] text-slate-300 max-w-xs leading-relaxed">
                  {errorMessage}
                </p>
                <div className="flex gap-2 flex-wrap justify-center">
                  <button
                    type="button"
                    onClick={() => startScanner(cameraFacing)}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Isku day mar kale
                  </button>
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Sawir Toos ah (iPhone Camera)</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* DEDICATED DIRECT IPHONE / SMARTPHONE CAMERA BUTTON (Instant Hardware Macro & HDR) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => nativeCameraInputRef.current?.click()}
              className="flex-1 py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-98"
              title="Ku sawir Kamerada rasmiga ah ee iPhone/Android (Auto-Focus & Macro)"
            >
              <Smartphone className="w-4 h-4 shrink-0 text-emerald-300" />
              <span>Sawir Kamerada iPhone (Direct Snap)</span>
            </button>
          </div>

          {/* Collapsible Manual Barcode Fallback */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowManualInput(!showManualInput)}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 flex items-center justify-center gap-1 cursor-pointer py-1"
            >
              <span>{showManualInput ? 'Qari gelinta gacanta' : 'Ma haysaa koodh aad gacanta ku gelinayso?'}</span>
              {showManualInput ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showManualInput && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualCode.trim()) {
                    handleDetectedCode(manualCode.trim());
                    setManualCode('');
                  }
                }}
                className="flex gap-2 mt-2"
              >
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Geli baarkoodh (tusaale EAN-13: 5901234123457)..."
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0"
                >
                  Geli
                </button>
              </form>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-100 dark:bg-slate-900 px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs">
          <span className="text-[11px] text-slate-500">
            EAN-13, EAN-8, UPC, Code 128 & QR toos ayay u shaqaynayaan.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg cursor-pointer"
          >
            Xir
          </button>
        </div>

      </div>
    </div>
  );
}
