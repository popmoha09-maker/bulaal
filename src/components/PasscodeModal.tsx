/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Lock, KeyRound, CheckCircle2, AlertCircle, X, ShieldAlert } from 'lucide-react';

interface PasscodeModalProps {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  targetUser?: User | null;
  requiredRole?: 'admin' | 'inventory_manager' | 'any';
  allUsers?: User[];
  onSuccess: (authenticatedUser?: User) => void;
  onClose: () => void;
}

export function PasscodeModal({
  isOpen,
  title = "Authentication Required",
  subtitle = "Please enter 4-digit passcode / PIN to continue",
  targetUser = null,
  requiredRole = 'any',
  allUsers = [],
  onSuccess,
  onClose
}: PasscodeModalProps) {
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(targetUser);

  useEffect(() => {
    setSelectedUser(targetUser);
    setPin('');
    setErrorMsg('');
  }, [targetUser, isOpen]);

  if (!isOpen) return null;

  const handleKeyPress = (num: string) => {
    if (pin.length < 6) {
      const nextPin = pin + num;
      setPin(nextPin);
      setErrorMsg('');
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg('');
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pin) {
      setErrorMsg('Please enter a passcode PIN.');
      return;
    }

    // Check PIN against selected user or any admin user if requiredRole is admin
    if (selectedUser) {
      const expectedPin = selectedUser.pinCode || '1234';
      if (pin === expectedPin || pin === '9999') { // 9999 is master override PIN
        onSuccess(selectedUser);
        setPin('');
        return;
      }
    } else if (requiredRole === 'admin') {
      const adminUsers = allUsers.filter(u => u.role === 'admin');
      const isValidAdminPin = adminUsers.some(u => (u.pinCode || '9999') === pin) || pin === '9999';
      if (isValidAdminPin) {
        const adminUser = adminUsers[0] || selectedUser;
        onSuccess(adminUser);
        setPin('');
        return;
      }
    } else if (allUsers.length > 0) {
      const matchedUser = allUsers.find(u => (u.pinCode || '1234') === pin || (u.role === 'admin' && pin === '9999'));
      if (matchedUser) {
        onSuccess(matchedUser);
        setPin('');
        return;
      }
    }

    setErrorMsg('Invalid Passcode PIN. Please try again.');
    setPin('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" dir="ltr">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-6 text-center space-y-4 text-slate-900 dark:text-slate-100 font-sans relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon & Title */}
        <div className="flex flex-col items-center">
          <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2.5">
            <KeyRound className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
            {title}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
            {subtitle}
          </p>
        </div>

        {/* Selected User Badge */}
        {selectedUser ? (
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{selectedUser.avatar}</span>
              <div className="text-left leading-tight">
                <span className="font-bold text-slate-900 dark:text-white block">{selectedUser.username}</span>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-mono font-bold">
                  Role: {selectedUser.role === 'admin' ? 'Admin / Manager' : selectedUser.role === 'inventory_manager' ? 'Inventory Manager' : 'Cashier'}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
              PIN Verification
            </span>
          </div>
        ) : allUsers.length > 0 && (
          <div className="text-left space-y-1">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">Select Staff Member:</label>
            <select
              value={selectedUser?.id || ''}
              onChange={(e) => {
                const u = allUsers.find(usr => usr.id === e.target.value);
                setSelectedUser(u || null);
              }}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
            >
              <option value="">Any Authorized Staff Member</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.avatar} {u.username} ({u.role.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* PIN Indicators Display */}
        <div className="flex justify-center items-center gap-3 py-2">
          {[0, 1, 2, 3].map((idx) => {
            const hasDigit = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-11 h-12 rounded-xl border-2 flex items-center justify-center text-xl font-bold font-mono transition-all ${
                  hasDigit
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 shadow-sm scale-105'
                    : 'border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-400'
                }`}
              >
                {hasDigit ? '•' : ''}
              </div>
            );
          })}
        </div>

        {/* Error Message Alert */}
        {errorMsg && (
          <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Numeric Keypad Grid */}
        <div className="grid grid-cols-3 gap-2 pt-1 select-none">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeyPress(digit)}
              className="py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-900 dark:text-white font-mono font-bold text-lg rounded-xl transition-all cursor-pointer active:scale-95 border border-slate-200 dark:border-slate-750"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-400 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95 border border-slate-200 dark:border-slate-750"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-900 dark:text-white font-mono font-bold text-lg rounded-xl transition-all cursor-pointer active:scale-95 border border-slate-200 dark:border-slate-750"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-400 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95 border border-slate-200 dark:border-slate-750"
          >
            ⌫
          </button>
        </div>

        {/* Submit & Cancel Buttons */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            className="flex-1 py-3 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Verify Passcode</span>
          </button>
        </div>

        {/* Default Passcodes Reference Note */}
        <div className="bg-slate-50 dark:bg-slate-950 p-2.5 border border-slate-200 dark:border-slate-850 rounded-xl text-[10px] text-slate-500 font-mono leading-relaxed">
          <span className="font-bold block text-slate-700 dark:text-slate-300">Default Member PIN Passcodes:</span>
          Admin: <strong className="text-blue-600 dark:text-blue-400">9999</strong> | Inventory: <strong className="text-amber-600 dark:text-amber-400">5555</strong> | Cashier: <strong className="text-emerald-600 dark:text-emerald-400">1234</strong>
        </div>

      </div>
    </div>
  );
}
