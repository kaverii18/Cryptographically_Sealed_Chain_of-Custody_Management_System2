/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { DashboardView } from './components/DashboardView';
import { EvidenceIntake } from './components/EvidenceIntake';
import { CustodyLedger } from './components/CustodyLedger';
import { ForensicVerificationModule } from './components/ForensicVerificationModule';
import { SteganographyModule } from './components/SteganographyModule';
import { ActorKeyManager } from './components/ActorKeyManager';
import {
  initStorage,
  saveEvidence,
  deleteEvidence,
  saveOfficer,
  setActiveOfficerId,
  resetToDefaults,
} from './lib/storage';
import { EvidenceRecord, OfficerIdentity, CustodyEntry } from './types/custody';
import {
  ShieldCheck,
  CheckCircle2,
  LayoutDashboard,
  Upload,
  FileCheck,
  Shield,
  Eye,
  Key,
  RotateCcw,
  Plus,
} from 'lucide-react';

type TabType = 'dashboard' | 'intake' | 'ledger' | 'verify' | 'stego' | 'keys';

export default function App() {
  const [evidenceList, setEvidenceList] = useState<EvidenceRecord[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>('');
  const [officers, setOfficers] = useState<OfficerIdentity[]>([]);
  const [activeOfficer, setActiveOfficer] = useState<OfficerIdentity | null>(null);
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');

  const [notification, setNotification] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize storage
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const data = await initStorage();
        setEvidenceList(data.evidence);
        setOfficers(data.officers);
        setActiveOfficer(data.activeOfficer);
        if (data.evidence.length > 0) {
          setSelectedEvidenceId(data.evidence[0].id);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  const handleSelectOfficer = (officerId: string) => {
    setActiveOfficerId(officerId);
    const found = officers.find((o) => o.id === officerId) || null;
    setActiveOfficer(found);
    if (found) {
      showNotification(`Active signer switched to ${found.name}`);
    }
  };

  const handleSaveOfficer = (newOfficer: OfficerIdentity) => {
    saveOfficer(newOfficer);
    setOfficers((prev) => [...prev, newOfficer]);
    setActiveOfficer(newOfficer);
    setActiveOfficerId(newOfficer.id);
    showNotification(`New ECDSA keypair generated for ${newOfficer.name}`);
  };

  const handleSaveEvidence = (newRecord: EvidenceRecord) => {
    saveEvidence(newRecord);
    setEvidenceList((prev) => [newRecord, ...prev]);
    setSelectedEvidenceId(newRecord.id);
    setCurrentTab('ledger');
    showNotification(`Evidence ${newRecord.evidenceNumber} registered with sealed Genesis Block #0`);
  };

  const handleDeleteEvidence = (id: string) => {
    deleteEvidence(id);
    const updated = evidenceList.filter((e) => e.id !== id);
    setEvidenceList(updated);
    if (selectedEvidenceId === id && updated.length > 0) {
      setSelectedEvidenceId(updated[0].id);
    }
    showNotification('Evidence record removed from local repository');
  };

  const handleAddCustodyEntry = (newEntry: CustodyEntry) => {
    const target = evidenceList.find((e) => e.id === selectedEvidenceId);
    if (!target) return;

    const updatedChain = [...target.custodyChain, newEntry];
    const updatedRecord: EvidenceRecord = {
      ...target,
      currentCustodian: newEntry.to,
      storageLocation: newEntry.location || target.storageLocation,
      custodyChain: updatedChain,
    };

    saveEvidence(updatedRecord);
    setEvidenceList((prev) => prev.map((e) => (e.id === updatedRecord.id ? updatedRecord : e)));
    showNotification(`Block #${newEntry.index} cryptographically sealed & appended to chain`);
  };

  const handleUpdateEvidence = (updated: EvidenceRecord) => {
    saveEvidence(updated);
    setEvidenceList((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  const handleResetData = async () => {
    if (window.confirm('Reset all evidence and custodian keys to standard initial demo state?')) {
      setIsLoading(true);
      const data = await resetToDefaults();
      setEvidenceList(data.evidence);
      setOfficers(data.officers);
      setActiveOfficer(data.activeOfficer);
      if (data.evidence.length > 0) {
        setSelectedEvidenceId(data.evidence[0].id);
      }
      setIsLoading(false);
      showNotification('Reset to pristine cryptographic sample state');
    }
  };

  const selectedEvidence =
    evidenceList.find((e) => e.id === selectedEvidenceId) || evidenceList[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Bar Header */}
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-8 h-16">
            {/* Zone 1: Brand title */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setCurrentTab('dashboard');
                }}
                className="text-base font-bold tracking-tight text-white whitespace-nowrap hover:text-slate-200 transition-colors"
              >
                Chain of Custody
              </a>
            </div>

            {/* Zone 2: Navigation Links for all 6 components */}
            <nav className="hidden md:flex items-center gap-5 text-xs font-medium text-slate-300">
              <button
                onClick={() => setCurrentTab('dashboard')}
                className={`flex items-center gap-1.5 whitespace-nowrap py-1 transition-colors ${
                  currentTab === 'dashboard'
                    ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
                    : 'hover:text-white'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setCurrentTab('intake')}
                className={`flex items-center gap-1.5 whitespace-nowrap py-1 transition-colors ${
                  currentTab === 'intake'
                    ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
                    : 'hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Evidence Intake</span>
              </button>

              <button
                onClick={() => setCurrentTab('ledger')}
                className={`flex items-center gap-1.5 whitespace-nowrap py-1 transition-colors ${
                  currentTab === 'ledger'
                    ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
                    : 'hover:text-white'
                }`}
              >
                <FileCheck className="w-3.5 h-3.5" />
                <span>Custody Ledger</span>
              </button>

              <button
                onClick={() => setCurrentTab('verify')}
                className={`flex items-center gap-1.5 whitespace-nowrap py-1 transition-colors ${
                  currentTab === 'verify'
                    ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
                    : 'hover:text-white'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Forensic Verification</span>
              </button>

              <button
                onClick={() => setCurrentTab('stego')}
                className={`flex items-center gap-1.5 whitespace-nowrap py-1 transition-colors ${
                  currentTab === 'stego'
                    ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
                    : 'hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Steganography</span>
              </button>

              <button
                onClick={() => setCurrentTab('keys')}
                className={`flex items-center gap-1.5 whitespace-nowrap py-1 transition-colors ${
                  currentTab === 'keys'
                    ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400'
                    : 'hover:text-white'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Key Custodians</span>
              </button>
            </nav>

            {/* Zone 3: Actions & Active Signer */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Active Custodian Selector */}
              <div className="hidden lg:flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 border border-slate-700 rounded px-2.5 py-1.5">
                <span className="text-slate-400">Signer:</span>
                <select
                  aria-label="Active Signer Officer"
                  value={activeOfficer?.id || ''}
                  onChange={(e) => handleSelectOfficer(e.target.value)}
                  className="bg-transparent text-white font-medium focus:outline-none cursor-pointer max-w-[140px] truncate"
                >
                  {officers.map((off) => (
                    <option key={off.id} value={off.id} className="bg-slate-900 text-white">
                      {off.name} ({off.badge})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleResetData}
                title="Reset to initial sample demo data"
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => setCurrentTab('intake')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded transition-colors whitespace-nowrap shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Intake</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg shadow-lg border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="py-24 text-center">
            <div className="w-8 h-8 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-500 font-medium">
              Initializing Web Crypto ECDSA Keypairs & Sealing Genesis Records...
            </p>
          </div>
        ) : (
          <>
            {/* Component 1: DashboardView */}
            {currentTab === 'dashboard' && (
              <DashboardView
                evidenceList={evidenceList}
                selectedEvidenceId={selectedEvidenceId}
                onSelectEvidence={(id) => setSelectedEvidenceId(id)}
                onOpenIntake={() => setCurrentTab('intake')}
                onOpenVerify={(id) => {
                  setSelectedEvidenceId(id);
                  setCurrentTab('verify');
                }}
                onOpenStego={(id) => {
                  setSelectedEvidenceId(id);
                  setCurrentTab('stego');
                }}
                onOpenLedger={(id) => {
                  setSelectedEvidenceId(id);
                  setCurrentTab('ledger');
                }}
                onDeleteEvidence={handleDeleteEvidence}
                activeOfficer={activeOfficer}
              />
            )}

            {/* Component 2: EvidenceIntake */}
            {currentTab === 'intake' && (
              <EvidenceIntake
                onSaveEvidence={handleSaveEvidence}
                officers={officers}
                activeOfficer={activeOfficer}
                onCancel={() => setCurrentTab('dashboard')}
              />
            )}

            {/* Component 3: CustodyLedger */}
            {currentTab === 'ledger' && selectedEvidence && (
              <CustodyLedger
                evidence={selectedEvidence}
                evidenceList={evidenceList}
                onSelectEvidence={(id) => setSelectedEvidenceId(id)}
                onAddCustodyEntry={handleAddCustodyEntry}
                onOpenVerify={() => setCurrentTab('verify')}
                officers={officers}
                activeOfficer={activeOfficer}
              />
            )}

            {/* Component 4: ForensicVerificationModule */}
            {currentTab === 'verify' && selectedEvidence && (
              <ForensicVerificationModule
                evidence={selectedEvidence}
                evidenceList={evidenceList}
                onSelectEvidence={(id) => setSelectedEvidenceId(id)}
                onUpdateEvidence={handleUpdateEvidence}
                onResetChainToOriginal={handleResetData}
              />
            )}

            {/* Component 5: SteganographyModule */}
            {currentTab === 'stego' && selectedEvidence && (
              <SteganographyModule
                evidence={selectedEvidence}
                evidenceList={evidenceList}
                onSelectEvidence={(id) => setSelectedEvidenceId(id)}
                activeOfficer={activeOfficer}
              />
            )}

            {/* Component 6: ActorKeyManager */}
            {currentTab === 'keys' && (
              <ActorKeyManager
                officers={officers}
                activeOfficer={activeOfficer}
                onSelectActiveOfficer={handleSelectOfficer}
                onSaveOfficer={handleSaveOfficer}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
