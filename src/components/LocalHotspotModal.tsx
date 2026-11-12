import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Smartphone, Wifi, Copy, Check, ExternalLink, X, RefreshCw, Laptop, ShieldCheck } from 'lucide-react';
import { fetchNetworkInfo, NetworkInfoResponse } from '../lib/supabaseDb';

interface LocalHotspotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LocalHotspotModal({ isOpen, onClose }: LocalHotspotModalProps) {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfoResponse | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string>('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadNetwork = async () => {
    setIsLoading(true);
    try {
      const data = await fetchNetworkInfo();
      if (data) {
        setNetworkInfo(data);
        const initialUrl = data.devices[0]?.url || data.primaryUrl || data.localhostUrl;
        setSelectedUrl(initialUrl);
      }
    } catch (e) {
      console.warn('Network info fetch warning:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadNetwork();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedUrl) {
      QRCode.toDataURL(selectedUrl, {
        width: 260,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      })
      .then(url => setQrCodeDataUrl(url))
      .catch(err => console.error('QR generation error:', err));
    }
  }, [selectedUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!selectedUrl) return;
    navigator.clipboard.writeText(selectedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="ltr">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 relative flex flex-col gap-5 text-slate-900 dark:text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                Xiriirka Taleefannada (Wi-Fi Hotspot)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                100% Offline · Dhammaan taleefannadu waxay wadaagaan hal database
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QR Code and Connection Details */}
        <div className="flex flex-col items-center gap-4 bg-slate-50 dark:bg-slate-950/50 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
          
          {qrCodeDataUrl ? (
            <div className="bg-white p-3 rounded-2xl shadow-md border border-slate-200">
              <img 
                src={qrCodeDataUrl} 
                alt="POS Mobile Access QR Code" 
                className="w-44 h-44 rounded-xl"
              />
            </div>
          ) : (
            <div className="w-44 h-44 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-2xl flex items-center justify-center text-xs text-slate-400">
              Waa la soo saarayaa QR...
            </div>
          )}

          <div className="w-full text-center space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Cinwaanka Taleefanka laga furayo:
            </span>
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="font-mono font-bold text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-xl text-blue-600 dark:text-blue-400 select-all">
                {selectedUrl || 'http://localhost:3000'}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="p-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
                title="Koobi cinwaanka"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Network Selection (if multiple IP addresses) */}
          {networkInfo && networkInfo.devices && networkInfo.devices.length > 1 && (
            <div className="w-full pt-2">
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                Dooro Shabakadda (Network Interface):
              </label>
              <select
                value={selectedUrl}
                onChange={(e) => setSelectedUrl(e.target.value)}
                className="w-full text-xs font-semibold p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              >
                {networkInfo.devices.map((d, idx) => (
                  <option key={idx} value={d.url}>
                    {d.name} ({d.type}) — {d.url}
                  </option>
                ))}
              </select>
            </div>
          )}

        </div>

        {/* Instructions in clear Somali */}
        <div className="space-y-2.5 text-xs">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Laptop className="w-4 h-4 text-blue-600" />
            <span>Sida Taleefannada Loo Xiro (3 Tallaabo oo Fudud):</span>
          </h3>

          <div className="space-y-2 text-slate-600 dark:text-slate-300 bg-slate-100/70 dark:bg-slate-850 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-[11px] leading-relaxed">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                1
              </span>
              <span>
                <strong>Sameey Wi-Fi Hotspot kombiyuutarkaaga</strong> (ama kombiyuutarka iyo taleefannada ku xir isla Wi-Fi-ga dukaanka).
              </span>
            </div>

            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                2
              </span>
              <span>
                <strong>Ka fur taleefanka camera-ga</strong> oo dul saar QR Code-ka sare, ama browser-ka Safari/Chrome ku qor cinwaanka sare.
              </span>
            </div>

            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                3
              </span>
              <span>
                <strong>Wax walba si toos ah ayay isu waafajinayaan (Real-Time):</strong> Iib kasta, badeecad cusub, ama deyn laga diiwaangeliyo taleefanka isla markiiba waxay ka soo baxaysaa kombiyuutarka kashyarka iyadoo aan internet loo baahnayn!
              </span>
            </div>
          </div>
        </div>

        {/* Status indicator footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Server-ka Maxalliga ah: Wuu shaqaynayaa (100% Offline)</span>
          </div>

          <button
            type="button"
            onClick={loadNetwork}
            disabled={isLoading}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer text-xs transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Cusbooneysii</span>
          </button>
        </div>

      </div>
    </div>
  );
}
