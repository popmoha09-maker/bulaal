import React, { useState, useEffect } from 'react';
import { 
  Shield, RefreshCw, 
  Eye, EyeOff, Download, Upload, Copy, Check, LogOut, CheckCircle2,
  Store, Phone, MapPin, Receipt, Save, Wifi, Smartphone, Laptop,
  Database, Trash2, Archive, AlertTriangle
} from 'lucide-react';
import { User, SyncQueueItem } from '../types';
import { 
  fetchBackupsList, 
  createInstantBackup, 
  restoreBackupFromFile, 
  deleteBackupFile, 
  ClientBackupItem,
  checkSupabaseStatus,
  SupabaseDbStatus
} from '../lib/supabaseDb';

interface CashierSettingsProps {
  currentUser: User;
  usersList: User[];
  onSwitchUser: (userId: string) => void;
  isOffline: boolean;
  onToggleOffline: () => void;
  isEncryptedCost: boolean;
  onToggleCostEncryption: () => void;
  syncQueue: SyncQueueItem[];
  onForceSync: () => void;
  onResetSystem?: () => void;
  activeUsername?: string | null;
  lastCloudSyncTime?: string | null;
  isCloudSyncing?: boolean;
  isQuotaExceeded?: boolean;
  cloudSyncError?: string | null;
  onManualDatabaseSync?: () => void;
  onResetQuotaCheck?: () => void;
  onLogout?: () => void;
  enterprise?: {
    companyName?: string;
    companyLocation?: string;
    warehouseName?: string;
    companyCode?: string;
    phone?: string;
    receiptFooter?: string;
  } | null;
  onUpdateEnterprise?: (updated: any) => void;
}

export function CashierSettings({
  currentUser,
  usersList,
  onSwitchUser,
  isOffline,
  onToggleOffline,
  isEncryptedCost,
  onToggleCostEncryption,
  syncQueue,
  onForceSync,
  activeUsername,
  lastCloudSyncTime,
  isCloudSyncing,
  cloudSyncError,
  onManualDatabaseSync,
  onLogout,
  enterprise,
  onUpdateEnterprise
}: CashierSettingsProps) {
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const [copiedBackup, setCopiedBackup] = useState(false);

  // Automated Disk Backups State
  const [backups, setBackups] = useState<ClientBackupItem[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmRestoreFile, setConfirmRestoreFile] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<SupabaseDbStatus | null>(null);
  const [loadingDbStatus, setLoadingDbStatus] = useState(false);

  const loadDbStatus = async () => {
    setLoadingDbStatus(true);
    try {
      const status = await checkSupabaseStatus();
      setDbStatus(status);
    } catch {}
    finally {
      setLoadingDbStatus(false);
    }
  };

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const list = await fetchBackupsList();
      setBackups(list);
    } catch {
      // ignore
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    loadBackups();
    loadDbStatus();
  }, []);

  const handleCreateNewBackup = async (label?: string) => {
    setCreatingBackup(true);
    setBackupFeedback(null);
    try {
      const res = await createInstantBackup(label || 'Kaydinta Kashyarka');
      if (res.success) {
        setBackupFeedback({ message: 'Nuqulka waxaa si guul leh loogu keydiyay disk-ga kombiyuutarka!', type: 'success' });
        loadBackups();
      } else {
        setBackupFeedback({ message: res.message || 'Khalad ayaa dhacay xilliga keydinta.', type: 'error' });
      }
    } catch (err: any) {
      setBackupFeedback({ message: err?.message || 'Khalad ayaa dhacay.', type: 'error' });
    } finally {
      setCreatingBackup(false);
      setTimeout(() => setBackupFeedback(null), 4000);
    }
  };

  const handleRestoreFromSelectedBackup = async (filename: string) => {
    setRestoringFile(filename);
    setConfirmRestoreFile(null);
    setBackupFeedback(null);
    try {
      const res = await restoreBackupFromFile(filename);
      if (res.success) {
        setBackupFeedback({ message: 'Xogtii si buuxda ayaa loogu soo celiyay nuqulkan! Boggu dib ayuu isu cusbooneysiinayaa...', type: 'success' });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setBackupFeedback({ message: res.message || 'Khalad ayaa dhacay xilliga soo celinta.', type: 'error' });
      }
    } catch (err: any) {
      setBackupFeedback({ message: err?.message || 'Khalad ayaa dhacay.', type: 'error' });
    } finally {
      setRestoringFile(null);
    }
  };

  const handleDeleteSelectedBackup = async (filename: string) => {
    const success = await deleteBackupFile(filename);
    if (success) {
      loadBackups();
      setBackupFeedback({ message: 'Nuqulka waa la tirtiray.', type: 'success' });
      setTimeout(() => setBackupFeedback(null), 3000);
    }
  };

  // Store & Receipt Information State
  const [storeName, setStoreName] = useState(enterprise?.companyName || 'BULAALE MINI MARKET');
  const [storePhone, setStorePhone] = useState(enterprise?.phone || '+252 61 500 0000');
  const [storeLocation, setStoreLocation] = useState(enterprise?.companyLocation || 'Suuqa Weyn · Laanta 01');
  const [receiptFooter, setReceiptFooter] = useState(
    enterprise?.receiptFooter || 'Alaabta waxaa la soo celin karaa 3 cisho gudahood adigoo wata rasiidkan.'
  );
  const [saveSettingsSuccess, setSaveSettingsSuccess] = useState(false);

  useEffect(() => {
    if (enterprise) {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (isTyping) return;

      if (enterprise.companyName) setStoreName(enterprise.companyName);
      if (enterprise.phone) setStorePhone(enterprise.phone);
      if (enterprise.companyLocation) setStoreLocation(enterprise.companyLocation);
      if (enterprise.receiptFooter) setReceiptFooter(enterprise.receiptFooter);
    }
  }, [enterprise]);

  const handleSaveStoreSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...enterprise,
      companyName: storeName.trim() || 'BULAALE MINI MARKET',
      phone: storePhone.trim() || '+252 61 500 0000',
      companyLocation: storeLocation.trim() || 'Suuqa Weyn · Laanta 01',
      receiptFooter: receiptFooter.trim()
    };
    if (onUpdateEnterprise) {
      onUpdateEnterprise(updated);
    } else {
      localStorage.setItem('sre_v4_enterprise', JSON.stringify(updated));
    }
    setSaveSettingsSuccess(true);
    setTimeout(() => setSaveSettingsSuccess(false), 3000);
  };

  const handleExportBackup = () => {
    const keys = [
      'sre_v4_enterprise',
      'sre_v4_warehouses',
      'sre_v4_products',
      'sre_v4_inventory',
      'sre_v4_users',
      'sre_v4_shifts',
      'sre_v4_invoices',
      'sre_v4_audit_logs',
      'sre_v4_sync_queue',
      'sre_v4_theme'
    ];
    const backup: Record<string, string | null> = {};
    keys.forEach(k => {
      backup[k] = localStorage.getItem(k);
    });
    
    const jsonStr = JSON.stringify(backup, null, 2);
    
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bulaale_nuqul_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyBackupToClipboard = () => {
    const keys = [
      'sre_v4_enterprise',
      'sre_v4_warehouses',
      'sre_v4_products',
      'sre_v4_inventory',
      'sre_v4_users',
      'sre_v4_shifts',
      'sre_v4_invoices',
      'sre_v4_audit_logs',
      'sre_v4_sync_queue',
      'sre_v4_theme'
    ];
    const backup: Record<string, string | null> = {};
    keys.forEach(k => {
      backup[k] = localStorage.getItem(k);
    });
    
    const jsonStr = JSON.stringify(backup);
    navigator.clipboard.writeText(jsonStr).then(() => {
      setCopiedBackup(true);
      setTimeout(() => setCopiedBackup(false), 3000);
    });
  };

  const handleImportBackup = () => {
    setImportError('');
    setImportSuccess(false);
    if (!importText.trim()) {
      setImportError('Fadlan marka hore ku dheji xogta JSON-ka ah ee nuqulka.');
      return;
    }
    
    try {
      const parsed = JSON.parse(importText.trim());
      Object.keys(parsed).forEach(k => {
        if (parsed[k] !== null) {
          localStorage.setItem(k, parsed[k]);
        }
      });
      
      setImportSuccess(true);
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      setImportError(err?.message || 'Nuqulka JSON-ka ah lama fahmin. Fadlan hubi xogta aad ku dhejisay.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-5 overflow-y-auto h-[calc(100vh-115px)] pr-1 text-left text-slate-900 dark:text-slate-100 font-sans" dir="ltr">
      
      {/* Store Account & Session Panel */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-xs font-sans">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-3 mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
              B
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm font-display">
                Xisaabta Dukaanka (Mulkiilaha)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Magaca isticmaalaha: <span className="font-semibold text-slate-900 dark:text-slate-200">{activeUsername || 'bulaale'}</span>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {dbStatus?.connected ? 'PostgreSQL · Supabase Online' : 'Local Disk Backup'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            {onManualDatabaseSync && (
              <button
                type="button"
                onClick={onManualDatabaseSync}
                disabled={isCloudSyncing}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCloudSyncing ? 'animate-spin' : ''}`} />
                <span>{isCloudSyncing ? 'Waa la cusbooneysiinayaa...' : 'Cusbooneysii Xogta'}</span>
              </button>
            )}
            {lastCloudSyncTime && (
              <span className="text-[11px] text-slate-400 font-mono">
                Waqtiga keydinta: {new Date(lastCloudSyncTime).toLocaleTimeString()}
              </span>
            )}
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/40 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-900/40 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 text-red-500" />
              <span>Ka Bax Nidaamka (Sign Out)</span>
            </button>
          )}
        </div>
      </div>

      {/* PostgreSQL Supabase Database Status Card */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-xs font-sans">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-3 mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm font-display">
              Xog-keydiyaha PostgreSQL (Supabase Cloud Database)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
              dbStatus?.connected 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
            }`}>
              <span className={`w-2 h-2 rounded-full ${dbStatus?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              {dbStatus?.connected ? `Xiriirku waa Furan yahay (${dbStatus.latencyMs}ms)` : 'Offline Fallback'}
            </span>
            <button
              type="button"
              onClick={loadDbStatus}
              disabled={loadingDbStatus}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer transition-colors"
              title="Hubi xaaladda database-ka"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDbStatus ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-850">
            <span className="text-[10px] text-slate-400 block font-semibold">Database Engine</span>
            <span className="font-bold text-slate-900 dark:text-white text-xs truncate block">
              {dbStatus?.engine || 'PostgreSQL (Supabase)'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-850">
            <span className="text-[10px] text-slate-400 block font-semibold">Host / Server</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 text-xs font-semibold truncate block">
              {dbStatus?.host || 'db.eqxzxmolcvqctkgcbpxy.supabase.co:5432'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-850">
            <span className="text-[10px] text-slate-400 block font-semibold">Tirada Alaabta (Products)</span>
            <span className="font-bold text-slate-900 dark:text-white text-xs">
              {dbStatus?.counts?.products ?? 8} Alaab diiwaangashan
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-850">
            <span className="text-[10px] text-slate-400 block font-semibold">Kaydka & Dhaqdhaqaaqa</span>
            <span className="font-bold text-slate-900 dark:text-white text-xs">
              {dbStatus?.counts?.inventorySlots ?? 9} Kayd · {dbStatus?.counts?.invoices ?? 0} Iib
            </span>
          </div>
        </div>
      </div>

      {/* Local Wi-Fi Hotspot & Multi-Device Info Card */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-xs font-sans">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm font-display">
              Xiriirka Taleefannada & Wi-Fi Hotspot (Multi-Device Setup)
            </h3>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            Real-Time Sync Active
          </span>
        </div>

        <div className="space-y-2 text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
          <p>
            Kombiyuutarkani wuxuu u shaqeynayaa sidii <strong>Server Dhexe oo Maxalli ah (Local Server)</strong>. Dhammaan xogta waxaa lagu keydiyaa disk-ga kombiyuutarka (<code>data/pos_database.json</code>) iyadoo aan wax internet ah loo baahnayn.
          </p>
          <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-blue-600" />
              <span>Sida taleefannada dukaanka loogu xiro:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
              <li>Ka fur kombiyuutarka <strong>Mobile Hotspot</strong> ama labada qalab ku xir isla Wi-Fi router-ka dukaanka.</li>
              <li>Riix badhanka cagaaran ee madaxa sare ku yaal <strong>"Wi-Fi Hotspot / Taleefannada"</strong> si aad u hesho QR Code-ka iyo cinwaanka IP-ga.</li>
              <li>Taleefanka kasta oo ku xirma wuxuu wax ka iibin karaa, badeecado ku dari karaa, waxaana isla markiiba arki doona kombiyuutarka kashyarka.</li>
            </ul>
          </div>
        </div>
      </div>


      {/* STORE & RECEIPT SETTINGS (WORKABLE CUSTOMIZATION) */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl p-5 text-xs font-sans shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 font-display text-sm">
              Habeynta Xogta Dukaanka & Rasiidka (Store & Receipt Details)
            </h3>
          </div>
          {saveSettingsSuccess && (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" />
              Waa la keydiyay!
            </span>
          )}
        </div>

        <form onSubmit={handleSaveStoreSettings} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Store Name */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1.5 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-blue-600" />
                <span>Magaca Dukaanka (Store Name):</span>
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="BULAALE MINI MARKET"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl font-bold text-xs focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                required
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Wuxuu ka soo muuqanayaa madaxa rasiidka kasta.</span>
            </div>

            {/* Store Phone Number */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Telefoonka Dukaanka ee Rasiidka (Receipt Phone):</span>
              </label>
              <input
                type="text"
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                placeholder="+252 61 500 0000"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl font-mono font-bold text-xs focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                required
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Lambarka macaamiishu kula soo xiriirayaan ee rasiidka ku qoran.</span>
            </div>

            {/* Store Location */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-red-500" />
                <span>Cinwaanka / Laanta (Location / Address):</span>
              </label>
              <input
                type="text"
                value={storeLocation}
                onChange={(e) => setStoreLocation(e.target.value)}
                placeholder="Suuqa Weyn · Laanta Dhexe"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl font-medium text-xs focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
              />
            </div>

            {/* Receipt Footer Message */}
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1.5 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-amber-500" />
                <span>Farriinta Hoose ee Rasiidka (Footer / Return Note):</span>
              </label>
              <input
                type="text"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                placeholder="Alaabta waxaa la soo celin karaa 3 cisho gudahood..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl font-medium text-xs focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
              />
            </div>

          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl cursor-pointer transition-colors text-xs flex items-center gap-2 shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>Keydi Xogta Rasiidka</span>
            </button>
          </div>
        </form>
      </div>

      {/* Cost Privacy Toggle */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-xs font-sans">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-3 flex-wrap gap-2">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 font-display text-sm">
            <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Qarinta Qiimaha Soo Iibsiga (Cost Privacy)</span>
          </h3>
          <button
            onClick={onToggleCostEncryption}
            className={`px-3 py-1.5 border font-semibold rounded-xl cursor-pointer transition-colors flex items-center gap-1.5 text-xs ${
              isEncryptedCost 
                ? 'bg-amber-600 border-amber-700 text-white' 
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-800 dark:text-slate-300'
            }`}
          >
            {isEncryptedCost ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{isEncryptedCost ? 'Qari Qiimaha Soo Iibsiga' : 'Muuji Qiimaha Soo Iibsiga'}</span>
          </button>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-xs">
          Waxay qarinaysaa qiimaha soo iibsiga jumladaha ah si aysan u arkin macaamiisha soo booqata.
        </p>
      </div>

      {/* AUTOMATED & LOCAL DISK BACKUPS HUB */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-xs font-sans shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 font-display text-sm">
                Nuqullada Tooska ah & Dib-u-soo-celinta (Automatic & Disk Backups)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Xogtu waxay si toos ah ugu keydsantaa disk-ga kombiyuutarka (<code>./data/backups/</code>)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCreateNewBackup('Kaydinta Kashyarka')}
              disabled={creatingBackup}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl cursor-pointer transition-colors text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Archive className={`w-3.5 h-3.5 ${creatingBackup ? 'animate-spin' : ''}`} />
              <span>{creatingBackup ? 'Waa la keydinayaa...' : 'Samee Nuqul Hadda'}</span>
            </button>
            <button
              type="button"
              onClick={loadBackups}
              disabled={loadingBackups}
              className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="Dib u cusbooneysii liiska"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBackups ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Feedback message */}
        {backupFeedback && (
          <div className={`p-2.5 mb-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
            backupFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}>
            <span>{backupFeedback.message}</span>
          </div>
        )}

        {/* Confirmation Modal for Restore */}
        {confirmRestoreFile && (
          <div className="p-3.5 mb-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Ma hubtaa inaad rabto inaad xogta ku celiso nuqulkan?</span>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Faylka: <code className="font-mono font-bold">{confirmRestoreFile}</code>. Nidaamku wuxuu si toos ah u qaadi doonaa nuqul badbaado ah ka hor inta aan xogta la beddelin.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleRestoreFromSelectedBackup(confirmRestoreFile)}
                disabled={restoringFile !== null}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs cursor-pointer disabled:opacity-50"
              >
                {restoringFile ? 'Waa la soo celinayaa...' : 'Haa, Soo Celi Xogta'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRestoreFile(null)}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-lg text-xs cursor-pointer"
              >
                Jooji
              </button>
            </div>
          </div>
        )}

        {/* List of Backups */}
        <div className="space-y-2">
          {loadingBackups ? (
            <div className="py-6 text-center text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Waa la soo gelinayaa liiska nuqullada...</span>
            </div>
          ) : backups.length === 0 ? (
            <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl text-center text-slate-400">
              <Archive className="w-6 h-6 mx-auto mb-1 opacity-50" />
              <p>Weli ma jiraan nuqullo kaydsan. Riix "Samee Nuqul Hadda" si aad u keydisid xogtaada.</p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
              {backups.map((b) => (
                <div
                  key={b.filename}
                  className="p-3 bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-900 dark:hover:bg-slate-850 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <Database className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                          {b.label || 'Nuqul Kaydsan'}
                        </span>
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded font-mono">
                          {b.formattedSize}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span>{new Date(b.createdAt).toLocaleString()}</span>
                        <span>•</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {b.counts.products} Alaab · {b.counts.invoices} Iib · {b.counts.customers} Macaamiil
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmRestoreFile(b.filename)}
                      className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                      title="Soo celi xogtan"
                    >
                      Soo Celi
                    </button>

                    <a
                      href={`/api/db/backups/download/${encodeURIComponent(b.filename)}`}
                      download={b.filename}
                      className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1"
                      title="Soo degso faylka nuqulka"
                    >
                      <Download className="w-3 h-3" />
                      <span className="hidden sm:inline">USB</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => handleDeleteSelectedBackup(b.filename)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg cursor-pointer transition-colors"
                      title="Tirtir nuqulkan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Manual JSON Export & Import Card */}
      <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-xs font-sans">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-3 flex-wrap gap-2">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 font-display text-sm">
            <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Nuqul Ka Qaado & Soo Celi (Backup & Restore)</span>
          </h3>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleCopyBackupToClipboard}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold rounded-lg cursor-pointer transition-colors text-xs flex items-center gap-1"
            >
              {copiedBackup ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedBackup ? 'La Koobiyay' : 'Koobi Xogta'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportBackup}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg cursor-pointer transition-colors text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Soo Degso File (JSON)</span>
            </button>
          </div>
        </div>

        <div className="space-y-2.5 bg-slate-50 dark:bg-slate-900 p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl text-left">
          <label className="block font-bold text-slate-700 dark:text-slate-300">Soo Celi Nuqulkii Hore (Paste JSON):</label>
          <textarea
            rows={2}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Halkan ku dheji xogta JSON-ka ee aad hore u soo degsatay..."
            className="w-full p-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:border-blue-500 font-mono text-[11px]"
          ></textarea>
          
          {importError && (
            <p className="text-red-500 font-medium text-[11px]">{importError}</p>
          )}
          {importSuccess && (
            <p className="text-emerald-500 font-medium text-[11px]">Xogtii hore si guul leh ayaa loo soo celiyay!</p>
          )}

          <button
            type="button"
            onClick={handleImportBackup}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl cursor-pointer transition-colors flex items-center gap-1.5 text-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Soo Celi Nuqulka</span>
          </button>
        </div>
      </div>

    </div>
  );
}
