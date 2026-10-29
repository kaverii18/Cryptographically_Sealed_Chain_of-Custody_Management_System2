/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  Search,
  Plus,
  ArrowRight,
  Shield,
  Trash2,
  HardDrive,
  Copy,
  Check,
  FileCheck,
  Key,
  Layers,
  Eye,
  FileSearch,
} from 'lucide-react';
import { EvidenceRecord, OfficerIdentity } from '../types/custody';
import { formatBytes, truncateHash } from '../lib/crypto';

interface DashboardViewProps {
  evidenceList: EvidenceRecord[];
  selectedEvidenceId: string;
  onSelectEvidence: (id: string) => void;
  onOpenIntake: () => void;
  onOpenVerify: (id: string) => void;
  onOpenStego: (id: string) => void;
  onOpenLedger: (id: string) => void;
  onDeleteEvidence: (id: string) => void;
  activeOfficer: OfficerIdentity | null;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  evidenceList,
  selectedEvidenceId,
  onSelectEvidence,
  onOpenIntake,
  onOpenVerify,
  onOpenStego,
  onOpenLedger,
  onDeleteEvidence,
  activeOfficer,
}) => {
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = evidenceList.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.caseNumber.toLowerCase().includes(q) ||
      e.evidenceNumber.toLowerCase().includes(q) ||
      e.title.toLowerCase().includes(q) ||
      e.sha256Hash.toLowerCase().includes(q) ||
      e.currentCustodian.toLowerCase().includes(q)
    );
  });

  const handleCopy = (hash: string, id: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalBlocks = evidenceList.reduce((acc, curr) => acc + curr.custodyChain.length, 0);

  // Recent timeline entries across all evidence
  const recentActivities = evidenceList
    .flatMap((item) =>
      item.custodyChain.map((entry) => ({
        ...entry,
        caseNumber: item.caseNumber,
        evidenceTitle: item.title,
        evidenceId: item.id,
      }))
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Banner / System Summary */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <span>Cryptographic Forensics & Chain Operations</span>
              <span aria-hidden="true">·</span>
              <span>Web Crypto ECDSA (P-256)</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">Chain of Custody Dashboard</h1>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl">
              Centralized repository for digital evidence intake, cryptographic chain verification, steganographic watermarking, and immutable custody audit trails.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenIntake}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded transition-colors whitespace-nowrap shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Intake New Evidence</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500 font-medium">Registered Evidence</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
            {evidenceList.length} Items
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            SHA-256 client-side verified
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500 font-medium">Total Sealed Blocks</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
            {totalBlocks} Blocks
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            ECDSA P-256 digital signatures
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500 font-medium">Active Signer</span>
          <div className="text-sm font-bold text-slate-900 mt-1 truncate">
            {activeOfficer?.name || 'Authorized Custodian'}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block font-mono">
            {activeOfficer?.badge || 'NIST P-256'}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <span className="text-xs text-slate-500 font-medium">Integrity Standard</span>
          <div className="text-sm font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>FIPS 186-4 Admissible</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            Continuous hash pointer chain
          </span>
        </div>
      </div>

      {/* Main Grid: Evidence Cards + Recent Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Evidence Records List (2 Cols on lg) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Evidence Vault</h2>
              <p className="text-xs text-slate-500">
                Select an evidence item to review its chain or run forensic audits
              </p>
            </div>

            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search case, tag, hash..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filtered.map((item) => {
              const isSelected = item.id === selectedEvidenceId;

              return (
                <div
                  key={item.id}
                  className={`bg-white border rounded-lg p-4 transition-all ${
                    isSelected
                      ? 'border-emerald-600 ring-1 ring-emerald-600 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mb-0.5">
                        <span className="font-semibold text-slate-800">{item.caseNumber}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.evidenceNumber}</span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                    </div>

                    <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded font-mono shrink-0">
                      {item.custodyChain.length} Blocks
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 mb-3">{item.description}</p>

                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200/70 text-xs space-y-1 mb-3">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="flex items-center gap-1.5 truncate">
                        <HardDrive className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <strong className="text-slate-900 font-medium truncate">{item.fileName}</strong>
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono shrink-0">
                        {formatBytes(item.fileSize)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-1 border-t border-slate-200/50">
                      <span>SHA-256: {truncateHash(item.sha256Hash, 8, 8)}</span>
                      <button
                        onClick={() => handleCopy(item.sha256Hash, item.id)}
                        className="text-slate-400 hover:text-slate-700 p-0.5"
                        title="Copy full hash"
                      >
                        {copiedId === item.id ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onOpenLedger(item.id)}
                        className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>Chain of Custody</span>
                      </button>

                      <button
                        onClick={() => onOpenVerify(item.id)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>Verify Chain</span>
                      </button>

                      <button
                        onClick={() => onOpenStego(item.id)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded transition-colors"
                        title="Steganographic Watermarking"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                        <span>Stego Seal</span>
                      </button>
                    </div>

                    {evidenceList.length > 1 && (
                      <button
                        onClick={() => onDeleteEvidence(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="Delete evidence record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="py-12 text-center text-slate-500 bg-white border border-slate-200 rounded-lg text-xs">
                No evidence items found.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Recent Activity Feed */}
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recent Custody Actions</h2>
            <p className="text-xs text-slate-500">Chronological feed of signed transfers</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 divide-y divide-slate-100">
            {recentActivities.map((act) => (
              <div key={act.id} className="py-3 first:pt-0 last:pb-0 text-xs">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-slate-900 line-clamp-1">{act.action}</span>
                  <span className="font-mono text-[10px] text-slate-500 shrink-0">
                    {new Date(act.timestamp).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  {act.from} <ArrowRight className="w-2.5 h-2.5 inline mx-0.5 text-slate-400" />{' '}
                  <strong>{act.to}</strong>
                </p>
                <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 font-mono">
                  <span>Case {act.caseNumber}</span>
                  <span className="text-emerald-700">Block #{act.index} Sealed</span>
                </div>
              </div>
            ))}

            {recentActivities.length === 0 && (
              <p className="text-xs text-slate-500 py-4 text-center">No recent activity.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
