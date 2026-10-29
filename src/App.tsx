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
  appendCustodyBlock,
  deleteEvidence,
  saveOfficer,
  setActiveOfficerId,
  resetToDefaults,
} from './lib/storage';
import { EvidenceRecord, OfficerIdentity, CustodyEntry } from './types/custody';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  LayoutDashboard,
  Upload,
  Link2,
  Shield,
  Eye,
  Key,
  RotateCcw,
  Plus,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  UserCheck,
} from 'lucide-react';

type TabType = 'dashboard' | 'intake' | 'ledger' | 'verify' | 'stego' | 'keys';

interface NavSection {
  id: TabType;
  name: string;
  shortName: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

export default function App() {
  const [evidenceList, setEvidenceList] = useState<EvidenceRecord[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>('');
  const [officers, setOfficers] = useState<OfficerIdentity[]>([]);
  const [activeOfficer, setActiveOfficer] = useState<OfficerIdentity | null>(null);
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');

  // Sidebar Collapse & Mobile Navigation State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('coc_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  const [notification, setNotification] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize storage from SQLite backend
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
      } catch (err: any) {
        console.error('Initialization error:', err);
        showNotification(err.message || 'Failed to initialize database connection', true);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('coc_sidebar_collapsed', String(next));
      } catch (e) {
        // ignore
      }
      return next;
    });
  };

  const showNotification = (msg: string, isError = false) => {
    setNotification({ msg, isError });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleSelectOfficer = (officerId: string) => {
    setActiveOfficerId(officerId);
    const found = officers.find((o) => o.id === officerId) || null;
    setActiveOfficer(found);
    if (found) {
      showNotification(`Active signer switched to ${found.name}`);
    }
  };

  const handleSaveOfficer = async (newOfficer: OfficerIdentity) => {
    try {
      const activeId = activeOfficer?.id || newOfficer.id;
      const created = await saveOfficer(newOfficer, activeId);
      setOfficers((prev) => [...prev, created]);
      setActiveOfficer(created);
      setActiveOfficerId(created.id);
      showNotification(`New ECDSA keypair generated for ${created.name}`);
    } catch (err: any) {
      showNotification(err.message || 'Failed to persist officer to database', true);
    }
  };

  const handleSaveEvidence = async (newRecord: EvidenceRecord) => {
    try {
      const activeId = activeOfficer?.id || officers[0]?.id || '';
      const created = await saveEvidence(newRecord, activeId);
      setEvidenceList((prev) => [created, ...prev]);
      setSelectedEvidenceId(created.id);
      setCurrentTab('ledger');
      showNotification(`Evidence ${created.evidenceNumber} registered with sealed Genesis Block #0 in SQLite`);
    } catch (err: any) {
      showNotification(err.message || 'Failed to persist evidence to database', true);
    }
  };

  const handleDeleteEvidence = async (id: string) => {
    try {
      const activeId = activeOfficer?.id || officers[0]?.id || '';
      await deleteEvidence(id, activeId);
      const updated = evidenceList.filter((e) => e.id !== id);
      setEvidenceList(updated);
      if (selectedEvidenceId === id && updated.length > 0) {
        setSelectedEvidenceId(updated[0].id);
      }
      showNotification('Evidence record deleted from SQLite database');
    } catch (err: any) {
      showNotification(err.message || 'Failed to delete evidence record', true);
    }
  };

  const handleAddCustodyEntry = async (newEntry: CustodyEntry) => {
    try {
      const activeId = activeOfficer?.id || officers[0]?.id || '';
      const updatedRecord = await appendCustodyBlock(selectedEvidenceId, newEntry, activeId);
      setEvidenceList((prev) => prev.map((e) => (e.id === updatedRecord.id ? updatedRecord : e)));
      showNotification(`Block #${newEntry.index} cryptographically sealed & appended to SQLite chain`);
    } catch (err: any) {
      showNotification(err.message || 'Failed to append custody block to database', true);
    }
  };

  const handleUpdateEvidence = (updated: EvidenceRecord) => {
    // Used by ForensicVerificationModule's interactive tamper sandbox for simulated in-memory testing
    setEvidenceList((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  const handleResetData = async () => {
    if (window.confirm('Reset all evidence and custodian keys in SQLite database to default demo state?')) {
      setIsLoading(true);
      try {
        const data = await resetToDefaults();
        setEvidenceList(data.evidence);
        setOfficers(data.officers);
        setActiveOfficer(data.activeOfficer);
        if (data.evidence.length > 0) {
          setSelectedEvidenceId(data.evidence[0].id);
        }
        showNotification('Database reset to pristine cryptographic sample state');
      } catch (err: any) {
        showNotification(err.message || 'Failed to reset database', true);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const selectedEvidence =
    evidenceList.find((e) => e.id === selectedEvidenceId) || evidenceList[0];

  const totalBlocks = evidenceList.reduce((acc, curr) => acc + curr.custodyChain.length, 0);

  // Six main sections exactly matching requirements
  const NAV_SECTIONS: NavSection[] = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      shortName: 'Dash',
      icon: LayoutDashboard,
      badge: evidenceList.length > 0 ? evidenceList.length : undefined,
    },
    {
      id: 'intake',
      name: 'Evidence Intake',
      shortName: 'Intake',
      icon: Upload,
    },
    {
      id: 'ledger',
      name: 'Chain of Custody',
      shortName: 'Chain',
      icon: Link2,
      badge: totalBlocks > 0 ? totalBlocks : undefined,
    },
    {
      id: 'verify',
      name: 'Forensic Verification',
      shortName: 'Verify',
      icon: ShieldCheck,
    },
    {
      id: 'stego',
      name: 'Steganography & Encryption',
      shortName: 'Stego',
      icon: Eye,
    },
    {
      id: 'keys',
      name: 'Actor Key Manager',
      shortName: 'Keys',
      icon: Key,
      badge: officers.length > 0 ? officers.length : undefined,
    },
  ];

  const currentSection = NAV_SECTIONS.find((s) => s.id === currentTab) || NAV_SECTIONS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans antialiased">
      {/* Mobile Backdrop Overlay */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/70 z-40 lg:hidden backdrop-blur-xs transition-opacity duration-200"
        />
      )}

      {/* FIXED, COLLAPSIBLE LEFT SIDEBAR */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 bg-slate-900 border-r border-slate-800 text-white flex flex-col transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'w-20' : 'w-64'
        } ${
          isMobileSidebarOpen
            ? 'translate-x-0 shadow-2xl'
            : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Brand & Top Collapse Toggle */}
        <div className="h-16 px-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>

            {!isSidebarCollapsed && (
              <div className="truncate">
                <span className="font-bold text-sm tracking-tight text-white block truncate leading-tight">
                  Chain of Custody
                </span>
                <span className="text-[10px] text-slate-400 font-mono tracking-wider block">
                  CRYPTOGRAPHIC SEAL
                </span>
              </div>
            )}
          </div>

          {/* Desktop Collapse / Expand Toggle Button */}
          <button
            onClick={toggleSidebar}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={() => setIsMobileSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Menu (The Six Main Sections) */}
        <div className="flex-1 py-4 px-2.5 space-y-1.5 overflow-y-auto">
          {!isSidebarCollapsed && (
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Main Navigation
            </div>
          )}

          {NAV_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = currentTab === section.id;

            return (
              <button
                key={section.id}
                onClick={() => {
                  setCurrentTab(section.id);
                  setIsMobileSidebarOpen(false);
                }}
                title={isSidebarCollapsed ? section.name : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all duration-200 group text-left relative ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 font-semibold border-l-4 border-emerald-400 shadow-2xs'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 border-l-4 border-transparent'
                } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                    isActive
                      ? 'text-emerald-400 scale-105'
                      : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />

                {!isSidebarCollapsed && (
                  <span className="truncate flex-1 font-medium">{section.name}</span>
                )}

                {!isSidebarCollapsed && section.badge !== undefined && (
                  <span
                    className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                      isActive
                        ? 'bg-emerald-400/20 text-emerald-300'
                        : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'
                    }`}
                  >
                    {section.badge}
                  </span>
                )}

                {/* Collapsed Active Indicator Dot */}
                {isSidebarCollapsed && isActive && (
                  <span className="absolute right-1 top-2 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer: Active Signer, Reset Demo, & Status */}
        <div className="p-3 border-t border-slate-800 shrink-0 space-y-2 bg-slate-950/40">
          {/* Active Custodian Card */}
          {!isSidebarCollapsed ? (
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-lg p-2.5 space-y-1 text-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1 font-semibold text-slate-300">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Active Signer</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">P-256</span>
              </div>

              <select
                aria-label="Active Signing Custodian"
                value={activeOfficer?.id || ''}
                onChange={(e) => handleSelectOfficer(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white font-medium text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer truncate"
              >
                {officers.map((off) => (
                  <option key={off.id} value={off.id} className="bg-slate-900 text-white">
                    {off.name} ({off.badge})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div
              title={`Active Signer: ${activeOfficer?.name} (${activeOfficer?.badge})`}
              className="w-full flex items-center justify-center p-2 rounded-lg bg-slate-800 text-emerald-400 cursor-pointer"
              onClick={() => setCurrentTab('keys')}
            >
              <UserCheck className="w-4 h-4" />
            </div>
          )}

          {/* Reset Demo Data & Quick Action */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={handleResetData}
              title="Reset sample evidence & custodian keys"
              className={`flex items-center gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded px-2 py-1 text-xs transition-colors ${
                isSidebarCollapsed ? 'w-full justify-center p-2' : ''
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {!isSidebarCollapsed && <span>Reset Demo</span>}
            </button>

            {!isSidebarCollapsed && (
              <button
                onClick={toggleSidebar}
                title="Collapse sidebar to icon-only"
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* RIGHT SIDE MAIN VIEWPORT CONTENT */}
      <div
        className={`flex-1 min-w-0 flex flex-col transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Top Header on Right Side (Breadcrumbs, Status, Mobile Toggle) */}
        <header className="bg-white border-b border-slate-200 h-16 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {/* Mobile Sidebar Hamburger Toggle */}
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb / Section Header */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-400 hidden sm:inline">
                Chain of Custody
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-bold text-slate-900 text-sm sm:text-base">
                {currentSection.name}
              </span>
            </div>
          </div>

          {/* Right Header Badges & Intake CTA */}
          <div className="flex items-center gap-3">
            {/* Active Security Standard Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-mono">FIPS 186-4</span>
            </div>

            {/* Direct Intake CTA */}
            {currentTab !== 'intake' && (
              <button
                onClick={() => setCurrentTab('intake')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded transition-colors whitespace-nowrap shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Intake Evidence</span>
                <span className="sm:hidden">Intake</span>
              </button>
            )}
          </div>
        </header>

        {/* Notification Toast */}
        {notification && (
          <div
            className={`fixed bottom-5 right-5 z-50 text-xs px-4 py-2.5 rounded-lg shadow-xl border flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200 ${
              notification.isError
                ? 'bg-rose-950/95 border-rose-800 text-rose-200'
                : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            {notification.isError ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{notification.msg}</span>
          </div>
        )}

        {/* Main Content Body */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {isLoading ? (
            <div className="py-24 text-center">
              <div className="w-8 h-8 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-500 font-medium">
                Initializing Web Crypto ECDSA Keypairs & Sealing Genesis Records...
              </p>
            </div>
          ) : (
            <>
              {/* Section 1: Dashboard */}
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

              {/* Section 2: Evidence Intake */}
              {currentTab === 'intake' && (
                <EvidenceIntake
                  onSaveEvidence={handleSaveEvidence}
                  officers={officers}
                  activeOfficer={activeOfficer}
                  onCancel={() => setCurrentTab('dashboard')}
                />
              )}

              {/* Section 3: Chain of Custody */}
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

              {/* Section 4: Forensic Verification */}
              {currentTab === 'verify' && selectedEvidence && (
                <ForensicVerificationModule
                  evidence={selectedEvidence}
                  evidenceList={evidenceList}
                  onSelectEvidence={(id) => setSelectedEvidenceId(id)}
                  onUpdateEvidence={handleUpdateEvidence}
                  onResetChainToOriginal={handleResetData}
                />
              )}

              {/* Section 5: Steganography & Encryption */}
              {currentTab === 'stego' && selectedEvidence && (
                <SteganographyModule
                  evidence={selectedEvidence}
                  evidenceList={evidenceList}
                  onSelectEvidence={(id) => setSelectedEvidenceId(id)}
                  activeOfficer={activeOfficer}
                />
              )}

              {/* Section 6: Actor Key Manager */}
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
    </div>
  );
}
