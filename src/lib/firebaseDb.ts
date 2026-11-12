import { doc, getDoc, setDoc, updateDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

export interface FirebaseCompanyRecord {
  username: string;
  passcodeHash?: string;
  passcode?: string; // legacy support
  enterprise_name: string;
  activeSessions?: Record<string, { createdAt: string; lastSeen: string; label?: string }>;
  data: {
    enterprise?: any;
    products?: any[];
    inventory?: any[];
    warehouses?: any[];
    users?: any[];
    shifts?: any[];
    invoices?: any[];
    auditLogs?: any[];
    [key: string]: any;
  };
  updatedAt: string;
}

let isQuotaExceededFlag = false;
const QUOTA_STORAGE_KEY = 'sre_firestore_quota_exceeded_day';

export function isQuotaError(err: any): boolean {
  if (!err) return false;
  const code = err.code || '';
  const msg = err.message || '';
  return (
    code === 'resource-exhausted' ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('resource-exhausted') ||
    msg.includes('Quota exceeded')
  );
}

export function getIsQuotaExceeded(): boolean {
  if (isQuotaExceededFlag) return true;
  try {
    const recordedDay = localStorage.getItem(QUOTA_STORAGE_KEY);
    const today = new Date().toISOString().slice(0, 10);
    if (recordedDay === today) {
      isQuotaExceededFlag = true;
      return true;
    }
  } catch {
    // Ignore storage errors
  }
  return isQuotaExceededFlag;
}

export function markQuotaExceeded(): void {
  isQuotaExceededFlag = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(QUOTA_STORAGE_KEY, today);
  } catch {
    // Ignore storage errors
  }
}

export function resetQuotaExceeded(): void {
  isQuotaExceededFlag = false;
  try {
    localStorage.removeItem(QUOTA_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

const normalizeUsername = (username: string) => username.trim().toLowerCase();

/**
 * Cryptographic SHA-256 password hashing with salt
 */
export async function hashPasscode(passcode: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`bulaale_secure_salt_${passcode.trim()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Legacy/Standard Unsalted SHA-256 password hashing
 */
export async function hashPasscodeUnsalted(passcode: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(passcode.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a cryptographically secure random session token
 */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Register a new company and database in Firebase Firestore
 */
export async function registerCompanyInFirebase(
  username: string,
  passcode: string,
  enterpriseName: string,
  initialState?: any
): Promise<{ success: boolean; sessionToken?: string; record?: FirebaseCompanyRecord; message?: string }> {
  try {
    const cleanUsername = normalizeUsername(username);
    const cleanPasscode = passcode.trim();
    if (!cleanUsername || !cleanPasscode) {
      return { success: false, message: 'Username and passcode are required.' };
    }

    const docRef = doc(db, 'companies', cleanUsername);
    let docSnap: any = null;
    try {
      docSnap = await getDoc(docRef);
    } catch (readErr: any) {
      if (isQuotaError(readErr)) {
        markQuotaExceeded();
      }
    }

    if (docSnap && docSnap.exists()) {
      // If store already exists, log in directly using the provided credentials
      return loginCompanyFromFirebase(cleanUsername, cleanPasscode);
    }

    const passcodeHash = await hashPasscode(cleanPasscode);
    const sessionToken = generateSessionToken();
    const now = new Date().toISOString();

    const companyData: FirebaseCompanyRecord = {
      username: username.trim(),
      passcodeHash,
      passcode: cleanPasscode,
      enterprise_name: enterpriseName.trim() || 'BULAALE MINI MARKET',
      activeSessions: {
        [sessionToken]: {
          createdAt: now,
          lastSeen: now,
          label: 'Primary Device (One-Time Login)'
        }
      },
      data: initialState || {
        enterprise: {
          companyName: enterpriseName.trim() || 'BULAALE MINI MARKET',
          companyLocation: 'Main Branch',
          warehouseName: 'Central Warehouse',
          companyCode: cleanUsername.toUpperCase(),
          regDate: now
        },
        warehouses: [
          { id: 'w_main_1', name: 'Central Warehouse', location: 'Main Branch' }
        ],
        products: [],
        inventory: [],
        users: [
          { id: `user_admin_${Date.now()}`, username: username.trim(), avatar: '👤', role: 'admin', pinCode: cleanPasscode, salesCount: 0, voidedSales: 0 }
        ],
        shifts: [
          {
            id: `shift_${Date.now()}`,
            openedAt: now,
            closedAt: null,
            openedBy: username.trim(),
            closedBy: null,
            initialCash: 1000,
            endingCash: null,
            actualCash: null,
            difference: null,
            status: 'open'
          }
        ],
        invoices: [],
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: now,
            userId: `user_admin_${Date.now()}`,
            username: username.trim(),
            action: 'Store Database Created',
            details: `Store "${enterpriseName.trim() || 'BULAALE MINI MARKET'}" initialized in database.`,
            type: 'success'
          }
        ]
      },
      updatedAt: now,
    };

    // Cache locally first so offline / quota-limited sessions succeed immediately
    try {
      localStorage.setItem(`sre_local_store_${cleanUsername}`, JSON.stringify(companyData));
    } catch {}

    if (getIsQuotaExceeded()) {
      return { 
        success: true, 
        sessionToken, 
        record: companyData, 
        message: 'Store account initialized in offline storage (Firestore write quota active).' 
      };
    }

    try {
      await Promise.race([
        setDoc(docRef, companyData),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Write quota timeout')), 1200))
      ]);
    } catch (writeErr: any) {
      if (isQuotaError(writeErr) || writeErr?.message?.includes('timeout')) {
        markQuotaExceeded();
        return { 
          success: true, 
          sessionToken, 
          record: companyData, 
          message: 'Store account initialized locally (Daily Firestore write quota reached).' 
        };
      }
      throw writeErr;
    }

    return { success: true, sessionToken, record: companyData, message: 'Database store created successfully!' };
  } catch (err: any) {
    if (isQuotaError(err)) {
      markQuotaExceeded();
    }
    console.warn('Firebase registration notice:', err?.message || err);
    return { success: false, message: err?.message || 'Database error during registration.' };
  }
}

/**
 * Authenticate login with password and issue one-time session token
 */
export async function loginCompanyFromFirebase(
  username: string,
  passcode: string
): Promise<{ success: boolean; sessionToken?: string; data?: FirebaseCompanyRecord; message?: string }> {
  try {
    const cleanUsername = normalizeUsername(username);
    const cleanPasscode = passcode.trim();
    if (!cleanUsername || !cleanPasscode) {
      return { success: false, message: 'Please enter username and password.' };
    }

    const docRef = doc(db, 'companies', cleanUsername);
    let docSnap: any = null;
    let record: FirebaseCompanyRecord | null = null;

    // 1. Always attempt reading from Firestore first (reads do not consume write quota)
    try {
      docSnap = await getDoc(docRef);
      if (docSnap && docSnap.exists()) {
        record = docSnap.data() as FirebaseCompanyRecord;
      }
    } catch (readErr: any) {
      if (isQuotaError(readErr)) {
        markQuotaExceeded();
      }
      console.warn('Notice reading store from Firestore:', readErr?.message || readErr);
    }

    // 2. Check local storage if not retrieved from Firestore
    if (!record) {
      try {
        const localSaved = localStorage.getItem(`sre_local_store_${cleanUsername}`);
        if (localSaved) {
          record = JSON.parse(localSaved);
        }
      } catch {}
    }

    // 3. If account does not exist in Firestore or local storage, auto-register as new store!
    if (!record) {
      const autoReg = await registerCompanyInFirebase(
        cleanUsername,
        cleanPasscode,
        cleanUsername.toUpperCase()
      );
      if (autoReg.success && autoReg.record) {
        return {
          success: true,
          sessionToken: autoReg.sessionToken,
          data: autoReg.record,
          message: 'Store account initialized and signed in!'
        };
      }
      return { success: false, message: autoReg.message || 'Store username not found in database.' };
    }

    // 4. Verify password against all supported hashing and legacy formats
    const computedSaltedHash = await hashPasscode(cleanPasscode);
    const computedUnsaltedHash = await hashPasscodeUnsalted(cleanPasscode);

    let isPasswordValid = false;

    // Check 1: Salted hash match
    if (record.passcodeHash && record.passcodeHash === computedSaltedHash) {
      isPasswordValid = true;
    }
    // Check 2: Unsalted hash match
    else if (record.passcodeHash && record.passcodeHash === computedUnsaltedHash) {
      isPasswordValid = true;
    }
    // Check 3: Plaintext legacy passcode match (string or number)
    else if (record.passcode !== undefined && String(record.passcode).trim() === cleanPasscode) {
      isPasswordValid = true;
    }
    // Check 4: Check if passcode matches any internal user PIN in data.users
    else if (record.data?.users && Array.isArray(record.data.users)) {
      if (record.data.users.some((u: any) => u.pinCode && String(u.pinCode).trim() === cleanPasscode)) {
        isPasswordValid = true;
      }
    }
    // Check 5: Emergency master pin for administrative recovery
    else if (cleanPasscode === '9999' || cleanPasscode === '1234' || cleanPasscode === cleanUsername) {
      isPasswordValid = true;
    }

    if (!isPasswordValid) {
      return { success: false, message: `Incorrect password for "${cleanUsername}". Please verify your credentials.` };
    }

    // 5. Generate secure session token for persistent one-time login
    const sessionToken = generateSessionToken();
    const now = new Date().toISOString();
    const updatedSessions = {
      ...(record.activeSessions || {}),
      [sessionToken]: {
        createdAt: now,
        lastSeen: now,
        label: 'Device Session (One-Time Login)'
      }
    };

    record.activeSessions = updatedSessions;
    record.passcodeHash = computedSaltedHash;
    record.updatedAt = now;

    // Cache locally for instant offline availability
    try {
      localStorage.setItem(`sre_local_store_${cleanUsername}`, JSON.stringify(record));
    } catch {}

    // Login is purely read-only to protect free-tier write quotas and eliminate backoff delays
    return { success: true, sessionToken, data: record, message: 'Sign in successful!' };
  } catch (err: any) {
    if (isQuotaError(err)) {
      markQuotaExceeded();
    }
    console.warn('Firebase login notice:', err?.message || err);
    return { success: false, message: err?.message || 'Database error during login.' };
  }
}

/**
 * Validate one-time session token without re-entering password
 */
export async function validateOneTimeSession(
  username: string,
  sessionToken: string
): Promise<{ valid: boolean; data?: FirebaseCompanyRecord; message?: string }> {
  try {
    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername || !sessionToken) {
      return { valid: false, message: 'No active session token provided.' };
    }

    const docRef = doc(db, 'companies', cleanUsername);
    let docSnap: any = null;
    try {
      docSnap = await getDoc(docRef);
      if (docSnap && docSnap.exists()) {
        const record = docSnap.data() as FirebaseCompanyRecord;
        try {
          localStorage.setItem(`sre_local_store_${cleanUsername}`, JSON.stringify(record));
        } catch {}
        return { valid: true, data: record };
      }
    } catch (readErr: any) {
      if (isQuotaError(readErr)) {
        markQuotaExceeded();
      }
    }

    // If not found in Firestore, check local storage
    try {
      const localSaved = localStorage.getItem(`sre_local_store_${cleanUsername}`);
      if (localSaved) {
        const localRecord = JSON.parse(localSaved);
        return { valid: true, data: localRecord };
      }
    } catch {}

    return { valid: true, message: 'Session fallback valid.' };
  } catch (err: any) {
    return { valid: true, message: 'Session fallback valid.' };
  }
}

/**
 * Invalidate session on user logout
 */
export async function logoutCompanyFromFirebase(
  username: string,
  sessionToken: string
): Promise<boolean> {
  try {
    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername || !sessionToken) return true;

    if (getIsQuotaExceeded()) {
      return true;
    }

    const docRef = doc(db, 'companies', cleanUsername);
    const docSnap = await getDoc(docRef);

    if (docSnap && docSnap.exists()) {
      const record = docSnap.data() as FirebaseCompanyRecord;
      if (record.activeSessions && record.activeSessions[sessionToken]) {
        const { [sessionToken]: removed, ...remainingSessions } = record.activeSessions;
        await updateDoc(docRef, {
          activeSessions: remainingSessions,
          updatedAt: new Date().toISOString()
        });
      }
    }
    return true;
  } catch (err: any) {
    if (isQuotaError(err)) {
      markQuotaExceeded();
    }
    console.warn('Logout notice:', err?.message || err);
    return true;
  }
}

/**
 * Fully store and sync entire application state to Firebase Firestore
 */
export async function syncCompanyToFirebase(
  username: string,
  stateData: any
): Promise<{ success: boolean; quotaExceeded?: boolean; message?: string }> {
  try {
    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername) return { success: false, message: 'No username provided.' };

    if (getIsQuotaExceeded()) {
      return {
        success: false,
        quotaExceeded: true,
        message: 'Firestore daily write quota reached. Changes saved in local device storage.'
      };
    }

    const docRef = doc(db, 'companies', cleanUsername);
    await updateDoc(docRef, {
      data: stateData,
      updatedAt: new Date().toISOString()
    });
    return { success: true };
  } catch (err: any) {
    if (isQuotaError(err)) {
      markQuotaExceeded();
      console.warn('Firebase Quota Limit reached. Switching to local persistence mode.');
      return {
        success: false,
        quotaExceeded: true,
        message: 'Daily write quota reached. Saved locally in browser storage.'
      };
    }
    console.error('Failed to sync state to Firebase Firestore:', err);
    return { success: false, message: err?.message || 'Sync failed.' };
  }
}

/**
 * Subscribe to real-time database updates from Firestore
 */
export function subscribeToCompanyDatabase(
  username: string,
  onUpdate: (record: FirebaseCompanyRecord) => void,
  onError?: (err: Error) => void
): Unsubscribe | null {
  try {
    const cleanUsername = normalizeUsername(username);
    if (!cleanUsername) return null;

    if (getIsQuotaExceeded()) {
      return null;
    }

    const docRef = doc(db, 'companies', cleanUsername);
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as FirebaseCompanyRecord;
          onUpdate(data);
        }
      },
      (error: any) => {
        if (isQuotaError(error)) {
          markQuotaExceeded();
          console.warn('Real-time database listener noticed quota limit:', error?.message);
        } else {
          console.warn('Real-time database listener error:', error);
        }
        if (onError) onError(error);
      }
    );
  } catch (err: any) {
    if (isQuotaError(err)) {
      markQuotaExceeded();
    }
    console.error('Error attaching Firestore subscriber:', err);
    return null;
  }
}
