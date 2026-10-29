/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FileText,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Plus,
  Shield,
  Printer,
  Download,
  Search,
  Lock,
  ArrowRight,
  User,
  Calendar,
  X,
  AlertCircle,
  Key,
} from 'lucide-react';
import { CustodyEntry, EvidenceRecord, OfficerIdentity } from '../types/custody';
import {
  buildCanonicalPayload,
  computeSha256OfString,
  formatBytes,
  signCanonicalData,
  truncateHash,
} from '../lib/crypto';

interface CustodyLedgerProps {
  evidence: EvidenceRecord;
  evidenceList: EvidenceRecord[];
  onSelectEvidence: (id: string) => void;
  onAddCustodyEntry: (newEntry: CustodyEntry) => void;
  onOpenVerify: () => void;
  officers: OfficerIdentity[];
  activeOfficer: OfficerIdentity | null;
}

const COMMON_ACTIONS = [
  'Transferred Custody to Digital Forensics Lab',
  'Checked Out for Forensic Bit-Stream Acquisition',
  'Physical Examination & Hardware Write-Block Imaging',
  'Checked Out for Court Proceedings (Exhibit Presentation)',
  'Transferred to Long-Term Evidence Vault Locker',
  'Sub-Sample Extracted for Specialized Analysis',
  'Tamper-Evident Bag Replaced & Re-sealed',
  'Returned to Primary Evidence Locker',
  'Final Case Disposition / Authorized Archival',
];

export const CustodyLedger: React.FC<CustodyLedgerProps> = ({
  evidence,
  evidenceList,
  onSelectEvidence,
  onAddCustodyEntry,
  onOpenVerify,
  officers,
  activeOfficer,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Modals inside CustodyLedger
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Add Custody Entry Form State
  const [action, setAction] = useState<string>(COMMON_ACTIONS[0]);
  const [customAction, setCustomAction] = useState<string>('');
  const [fromUser, setFromUser] = useState<string>(evidence?.currentCustodian || 'Investigator');
  const [toUser, setToUser] = useState<string>(
    officers.find((o) => o.name !== evidence?.currentCustodian)?.name || 'Dr. Evelyn Reed'
  );
  const [location, setLocation] = useState<string>(evidence?.storageLocation || 'Vault Safe #1');
  const [notes, setNotes] = useState<string>('Tamper-evident seal verified intact upon transfer.');
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>(
    activeOfficer?.id || officers[0]?.id || ''
  );
  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [addErrorMsg, setAddErrorMsg] = useState<string>('');

  const chain = evidence?.custodyChain || [];
  const latestBlock = chain[chain.length - 1];
  const nextIndex = chain.length;
  const previousEntryHash = latestBlock ? latestBlock.entryHash : '';

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleExportJson = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(evidence, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `sealed_chain_${evidence.caseNumber}_${evidence.evidenceNumber}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleOpenAddModal = () => {
    setFromUser(evidence.currentCustodian || 'Investigator');
    setToUser(officers.find((o) => o.name !== evidence.currentCustodian)?.name || 'Dr. Evelyn Reed');
    setLocation(evidence.storageLocation || 'Vault Safe #1');
    setSelectedOfficerId(activeOfficer?.id || officers[0]?.id || '');
    setAddErrorMsg('');
    setIsAddModalOpen(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedAction = action === 'custom' ? customAction : action;
    if (!resolvedAction.trim()) {
      setAddErrorMsg('Please specify an action for the custody log.');
      return;
    }
    if (!fromUser.trim() || !toUser.trim()) {
      setAddErrorMsg('Both From and To custodians must be specified.');
      return;
    }

    const signingOfficer = officers.find((o) => o.id === selectedOfficerId) || officers[0];
    if (!signingOfficer) {
      setAddErrorMsg('No valid custodian identity available for digital signing.');
      return;
    }

    setIsSigning(true);
    setAddErrorMsg('');

    try {
      const nowIso = new Date().toISOString();

      // Deterministic Canonical Payload
      const canonicalPayload = buildCanonicalPayload({
        index: nextIndex,
        previousEntryHash,
        evidenceHash: evidence.sha256Hash,
        action: resolvedAction.trim(),
        from: fromUser.trim(),
        to: toUser.trim(),
        timestamp: nowIso,
        location: location.trim(),
        notes: notes.trim(),
        signerPublicKeyHex: signingOfficer.publicKeyHex,
      });

      // Entry SHA-256 Hash
      const entryHash = await computeSha256OfString(canonicalPayload);

      // Sign with ECDSA P-256 via Web Crypto API
      const signatureHex = await signCanonicalData(canonicalPayload, signingOfficer.privateKeyJwk);

      const newEntry: CustodyEntry = {
        id: crypto.randomUUID(),
        index: nextIndex,
        timestamp: nowIso,
        action: resolvedAction.trim(),
        from: fromUser.trim(),
        to: toUser.trim(),
        location: location.trim(),
        notes: notes.trim(),
        evidenceHash: evidence.sha256Hash,
        previousEntryHash,
        entryHash,
        canonicalPayload,
        signatureHex,
        signer: {
          name: signingOfficer.name,
          badge: signingOfficer.badge,
          role: signingOfficer.role,
          agency: signingOfficer.agency,
          publicKeyJwk: signingOfficer.publicKeyJwk,
          publicKeyHex: signingOfficer.publicKeyHex,
        },
      };

      onAddCustodyEntry(newEntry);
      setIsAddModalOpen(false);
    } catch (err) {
      console.error('Error signing custody entry:', err);
      setAddErrorMsg('Cryptographic signing failed. Ensure Web Crypto API is enabled.');
    } finally {
      setIsSigning(false);
    }
  };

  const filteredChain = chain.filter((entry) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      entry.action.toLowerCase().includes(q) ||
      entry.from.toLowerCase().includes(q) ||
      entry.to.toLowerCase().includes(q) ||
      entry.notes.toLowerCase().includes(q) ||
      entry.signer.name.toLowerCase().includes(q) ||
      entry.entryHash.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Evidence Case Ribbon & Controls */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              {/* Evidence Switcher */}
              <span className="font-semibold text-slate-700">Case File:</span>
              <select
                aria-label="Active Case File Selector"
                value={evidence.id}
                onChange={(e) => onSelectEvidence(e.target.value)}
                className="bg-slate-100 border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-900 font-medium focus:outline-none"
              >
                {evidenceList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.caseNumber} · {item.evidenceNumber} ({item.title})
                  </option>
                ))}
              </select>
              <span aria-hidden="true">·</span>
              <span>{chain.length} Sealed Blocks</span>
            </div>

            <h1 className="text-xl font-bold text-slate-900">{evidence.title}</h1>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl">{evidence.description}</p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors shadow-sm whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Custody Entry</span>
            </button>

            <button
              onClick={onOpenVerify}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded transition-colors whitespace-nowrap"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Verify Integrity</span>
            </button>

            <button
              onClick={() => setIsPrintModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded transition-colors whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Certificate</span>
            </button>

            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>

        {/* Evidence Hash Invariant Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Root Evidence SHA-256:</span>
            <code className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[11px] select-all">
              {evidence.sha256Hash}
            </code>
            <button
              onClick={() => handleCopy(evidence.sha256Hash, 'root_hash')}
              className="text-slate-400 hover:text-slate-700 p-1"
              title="Copy Root SHA-256"
            >
              {copiedText === 'root_hash' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-4 text-slate-500 text-xs">
            <span>File: <strong className="text-slate-800 font-medium">{evidence.fileName}</strong></span>
            <span>Current Custodian: <strong className="text-slate-800 font-medium">{evidence.currentCustodian}</strong></span>
          </div>
        </div>

      </div>

      {/* Visual Chain Topology Stream */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Cryptographic Chain Topology</h3>
            <p className="text-xs text-slate-500">
              Each block incorporates the previous block's SHA-256 hash and is signed with ECDSA (P-256)
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {chain.length} Sealed Links
          </span>
        </div>

        <div className="overflow-x-auto pb-2 pt-1">
          <div className="flex items-stretch gap-3 min-w-max">
            {chain.map((entry, idx) => {
              const isGenesis = entry.index === 0;

              return (
                <React.Fragment key={entry.id}>
                  <div
                    onClick={() => setExpandedRowId(expandedRowId === entry.id ? null : entry.id)}
                    className={`w-60 p-3 rounded-lg border text-xs flex flex-col justify-between transition-all cursor-pointer ${
                      isGenesis
                        ? 'bg-slate-900 text-white border-slate-800 hover:border-emerald-500/50'
                        : 'bg-white text-slate-900 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-100/20 pb-1.5 mb-1.5">
                        <div className="flex items-center gap-1.5 font-bold font-mono">
                          <Lock className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Block #{entry.index}</span>
                        </div>
                        <span
                          className={`text-[9px] font-semibold px-1 py-0.5 rounded ${
                            isGenesis
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isGenesis ? 'GENESIS ROOT' : 'SEALED LINK'}
                        </span>
                      </div>

                      <p
                        className={`font-semibold line-clamp-2 mb-2 ${
                          isGenesis ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        {entry.action}
                      </p>

                      <div className="space-y-1 text-[11px] mb-2">
                        <div className="truncate text-slate-500">
                          {entry.from} → <strong className={isGenesis ? 'text-slate-200' : 'text-slate-800'}>{entry.to}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-slate-100/20 text-[10px] font-mono space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Hash:</span>
                        <span className="text-emerald-500 font-bold" title={entry.entryHash}>
                          {truncateHash(entry.entryHash, 5, 4)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {idx < chain.length - 1 && (
                    <div className="flex flex-col items-center justify-center text-slate-400 px-1">
                      <ArrowRight className="w-4 h-4" />
                      <span className="text-[9px] font-mono mt-0.5 text-slate-500">SHA-256</span>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Custody Log Table Header with Filter */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Custody Transfer Ledger Table</h2>
          <p className="text-xs text-slate-500">
            Immutable log of physical and digital custody transfers with cryptographic signatures
          </p>
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search action, officer, hash..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
          />
        </div>
      </div>

      {/* Custody Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4 w-12 text-center">Block</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Custody Transfer</th>
                <th className="py-3 px-4">Previous Hash</th>
                <th className="py-3 px-4">Entry Hash</th>
                <th className="py-3 px-4">Signer (ECDSA)</th>
                <th className="py-3 px-4 text-center">Seal</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredChain.map((entry) => {
                const isExpanded = expandedRowId === entry.id;
                const isGenesis = entry.index === 0;

                return (
                  <React.Fragment key={entry.id}>
                    <tr
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isExpanded ? 'bg-slate-50' : ''
                      }`}
                    >
                      {/* Block # */}
                      <td className="py-3 px-4 text-center font-mono font-semibold text-slate-700">
                        {isGenesis ? (
                          <span className="text-emerald-700 font-bold" title="Genesis Root Block">
                            #0
                          </span>
                        ) : (
                          `#${entry.index}`
                        )}
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono tabular-nums">
                        {new Date(entry.timestamp).toLocaleString(undefined, {
                          month: 'short',
                          day: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isGenesis ? 'bg-emerald-500' : 'bg-blue-500'
                            }`}
                          />
                          <span>{entry.action}</span>
                        </div>
                        {entry.location && (
                          <span className="text-[11px] font-normal text-slate-500 block">
                            {entry.location}
                          </span>
                        )}
                      </td>

                      {/* Transfer: From -> To */}
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-slate-600 max-w-[120px] truncate" title={entry.from}>
                            {entry.from}
                          </span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-900 max-w-[120px] truncate" title={entry.to}>
                            {entry.to}
                          </span>
                        </div>
                      </td>

                      {/* Previous Hash */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span title={entry.previousEntryHash}>
                            {isGenesis ? '0000...0000 (GENESIS)' : truncateHash(entry.previousEntryHash, 6, 4)}
                          </span>
                          <button
                            onClick={() => handleCopy(entry.previousEntryHash, `prev_${entry.id}`)}
                            className="text-slate-400 hover:text-slate-700 p-0.5"
                            title="Copy full hash"
                          >
                            {copiedText === `prev_${entry.id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Entry Hash */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-medium" title={entry.entryHash}>
                            {truncateHash(entry.entryHash, 6, 4)}
                          </span>
                          <button
                            onClick={() => handleCopy(entry.entryHash, `entry_${entry.id}`)}
                            className="text-slate-400 hover:text-slate-700 p-0.5"
                            title="Copy full hash"
                          >
                            {copiedText === `entry_${entry.id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Signer */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-slate-900 font-medium">{entry.signer.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {truncateHash(entry.signer.publicKeyHex, 6, 4)}
                        </div>
                      </td>

                      {/* Sealed Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>ECDSA</span>
                        </span>
                      </td>

                      {/* Details Toggle */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setExpandedRowId(isExpanded ? null : entry.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 p-1 rounded hover:bg-slate-200/60 transition-colors"
                        >
                          <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Drawer: Full Cryptographic Breakdown */}
                    {isExpanded && (
                      <tr className="bg-slate-50/60 border-b border-slate-200">
                        <td colSpan={9} className="p-4 sm:p-6">
                          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4 shadow-2xs">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-2">
                                <Lock className="w-4 h-4 text-slate-700" />
                                <h3 className="text-sm font-bold text-slate-900">
                                  Cryptographic Proof Manifest · Block #{entry.index}
                                </h3>
                              </div>
                              <span className="text-xs text-slate-500 font-mono">
                                ID: {entry.id}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              {/* Left Column: Chain References */}
                              <div className="space-y-3">
                                <div>
                                  <span className="font-semibold text-slate-700 block mb-0.5">
                                    Previous Block Hash (Parent Link):
                                  </span>
                                  <div className="p-2 bg-slate-900 text-slate-300 font-mono text-[11px] rounded break-all select-all">
                                    {entry.previousEntryHash}
                                  </div>
                                </div>

                                <div>
                                  <span className="font-semibold text-slate-700 block mb-0.5">
                                    Computed Entry Hash (SHA-256):
                                  </span>
                                  <div className="p-2 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded break-all select-all">
                                    {entry.entryHash}
                                  </div>
                                </div>

                                <div>
                                  <span className="font-semibold text-slate-700 block mb-0.5">
                                    Notes & Condition:
                                  </span>
                                  <div className="p-2 bg-slate-50 border border-slate-200 rounded text-slate-700">
                                    {entry.notes || 'No extra notes registered.'}
                                  </div>
                                </div>
                              </div>

                              {/* Right Column: ECDSA Signature & Public Key */}
                              <div className="space-y-3">
                                <div>
                                  <span className="font-semibold text-slate-700 block mb-0.5">
                                    Signer Public Key (ECDSA P-256 SPKI):
                                  </span>
                                  <div className="p-2 bg-slate-900 text-amber-300 font-mono text-[11px] rounded break-all select-all max-h-16 overflow-y-auto">
                                    {entry.signer.publicKeyHex}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    Signer: {entry.signer.name} ({entry.signer.badge}) · {entry.signer.agency}
                                  </div>
                                </div>

                                <div>
                                  <span className="font-semibold text-slate-700 block mb-0.5">
                                    ECDSA Digital Signature (P-256 / SHA-256 IEEE P1363):
                                  </span>
                                  <div className="p-2 bg-slate-900 text-cyan-300 font-mono text-[11px] rounded break-all select-all max-h-16 overflow-y-auto">
                                    {entry.signatureHex}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Canonical Payload */}
                            <div>
                              <span className="font-semibold text-slate-700 block mb-0.5 text-xs">
                                Deterministic Canonical JSON (Hashed with SHA-256 & Signed with ECDSA):
                              </span>
                              <pre className="p-2.5 bg-slate-950 text-slate-300 font-mono text-[11px] rounded overflow-x-auto whitespace-pre-wrap break-all select-all border border-slate-800">
                                {entry.canonicalPayload}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {filteredChain.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No custody entries found matching "{searchQuery}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Add Custody Entry */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white rounded-lg border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Add Custody Log Entry</h2>
                  <p className="text-xs text-slate-500">
                    Block #{nextIndex} · Sealed with ECDSA P-256 & Linked to Parent Hash
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              {addErrorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{addErrorMsg}</span>
                </div>
              )}

              {/* Hash Chain Reference */}
              <div className="p-3 bg-slate-900 text-slate-300 rounded-lg text-xs space-y-1.5 border border-slate-800 font-mono">
                <div className="flex items-center justify-between text-emerald-400 font-sans font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Parent Hash Pointer: Block #{nextIndex} → #{nextIndex - 1}</span>
                  </span>
                  <span className="text-[11px] text-slate-400">P-256 / SHA-256</span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Previous Entry Hash:
                  <div className="text-slate-200 break-all select-all pt-0.5">
                    {previousEntryHash}
                  </div>
                </div>
              </div>

              {/* Action */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custody Action <span className="text-rose-500">*</span>
                </label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                >
                  {COMMON_ACTIONS.map((act) => (
                    <option key={act} value={act}>
                      {act}
                    </option>
                  ))}
                  <option value="custom">Other / Custom Action...</option>
                </select>
                {action === 'custom' && (
                  <input
                    type="text"
                    required
                    value={customAction}
                    onChange={(e) => setCustomAction(e.target.value)}
                    placeholder="Enter custom custody action description"
                    className="mt-2 w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                  />
                )}
              </div>

              {/* Transfer: From -> To */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    From (Transferring Custodian) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fromUser}
                    onChange={(e) => setFromUser(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    To (Receiving Custodian) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={toUser}
                    onChange={(e) => setToUser(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              {/* Location & Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Storage / Transfer Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Forensics Workstation ALPHA-9, Vault Locker V-419"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Custody Notes & Physical Seal Serial #
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Packaging condition, tamper seal barcode, or purpose of custody transfer..."
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                />
              </div>

              {/* Signing Custodian */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-500" />
                    <span>Signing Custodian (ECDSA Key Holder)</span>
                  </span>
                  <span className="text-[11px] text-slate-500">Signs via Web Crypto API</span>
                </label>
                <select
                  value={selectedOfficerId}
                  onChange={(e) => setSelectedOfficerId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                >
                  {officers.map((off) => (
                    <option key={off.id} value={off.id}>
                      {off.name} · {off.role} ({off.badge})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSigning}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded transition-colors shadow-sm"
                >
                  <span>{isSigning ? 'Signing Block with ECDSA...' : 'Seal & Sign Custody Entry'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Printable Legal Certificate (DA-4137 standard) */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full border border-slate-300 overflow-hidden my-8 flex flex-col max-h-[90vh]">
            <div className="no-print bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold">Formal Chain of Custody Audit Certificate</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print / Save as PDF</span>
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-8 md:p-12 overflow-y-auto space-y-6 text-slate-900 bg-white">
              <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-1">
                    Forensics & Evidence Management Bureau
                  </div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">
                    RECORD OF CHAIN OF CUSTODY
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Cryptographically Sealed Chain Record · FIPS 186-4 ECDSA Digital Signatures
                  </p>
                </div>

                <div className="text-right font-mono text-xs text-slate-700">
                  <div>Case Number: <strong className="text-slate-900 font-bold">{evidence.caseNumber}</strong></div>
                  <div>Evidence Tag: <strong className="text-slate-900 font-bold">{evidence.evidenceNumber}</strong></div>
                  <div>Certified Date: {new Date().toLocaleDateString()}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-200 rounded text-xs">
                <div>
                  <span className="text-slate-500 block font-medium">Evidence Title</span>
                  <span className="font-bold text-slate-900">{evidence.title}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">File Name & Size</span>
                  <span className="font-semibold text-slate-900">{evidence.fileName} ({formatBytes(evidence.fileSize)})</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Intake Officer</span>
                  <span className="font-semibold text-slate-900">{evidence.intakeOfficer}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Current Custodian</span>
                  <span className="font-semibold text-slate-900">{evidence.currentCustodian}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-100 border border-slate-300 rounded text-xs space-y-1">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                  Root Evidence SHA-256 Digest (Physical Bit-Stream Invariant):
                </span>
                <div className="font-mono text-xs text-slate-900 break-all select-all font-semibold">
                  {evidence.sha256Hash}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Chronological Transfer & Sealing Ledger
                </h3>
                <table className="w-full text-left border-collapse text-xs border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-[11px] font-bold text-slate-700 uppercase">
                      <th className="p-2 border-r border-slate-300 w-12 text-center">Blk</th>
                      <th className="p-2 border-r border-slate-300">Date/Time (UTC)</th>
                      <th className="p-2 border-r border-slate-300">Custody Transfer</th>
                      <th className="p-2 border-r border-slate-300">Action & Reason</th>
                      <th className="p-2 border-r border-slate-300">Block SHA-256 Hash</th>
                      <th className="p-2">ECDSA Signer & Proof</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {chain.map((entry) => (
                      <tr key={entry.id} className="align-top">
                        <td className="p-2 border-r border-slate-300 text-center font-mono font-bold">
                          #{entry.index}
                        </td>
                        <td className="p-2 border-r border-slate-300 font-mono tabular-nums whitespace-nowrap text-slate-700">
                          {new Date(entry.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                        </td>
                        <td className="p-2 border-r border-slate-300">
                          <div className="font-medium text-slate-900">
                            {entry.from} → <strong>{entry.to}</strong>
                          </div>
                          <div className="text-[10px] text-slate-500">{entry.location}</div>
                        </td>
                        <td className="p-2 border-r border-slate-300">
                          <div className="font-semibold text-slate-900">{entry.action}</div>
                          <div className="text-[10px] text-slate-600 italic">{entry.notes}</div>
                        </td>
                        <td className="p-2 border-r border-slate-300 font-mono text-[10px] text-slate-700 break-all max-w-[140px]">
                          {entry.entryHash}
                        </td>
                        <td className="p-2 text-[10px]">
                          <div className="font-bold text-slate-900">{entry.signer.name}</div>
                          <div className="text-slate-500">{entry.signer.badge} · {entry.signer.agency}</div>
                          <div className="text-emerald-700 font-mono font-semibold mt-0.5">
                            [SEALED P-256: {truncateHash(entry.signatureHex, 6, 6)}]
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border border-slate-300 rounded bg-slate-50 text-[11px] text-slate-700 space-y-2">
                <h4 className="font-bold text-slate-900 uppercase">Cryptographic Attestation & Evidence Admissibility</h4>
                <p>
                  I hereby certify that the evidence detailed above was accounted for at each stage of transfer and examination. Each transaction was sealed using client-side SHA-256 cryptographic hashing and signed via the W3C Web Crypto API utilizing an ECDSA keypair on the NIST P-256 curve. Any alterations to data, timestamp, or custody link break hash continuity and invalidate digital signatures.
                </p>
                <div className="grid grid-cols-2 gap-8 pt-4">
                  <div className="border-t border-slate-400 pt-1 text-center">
                    <span className="text-slate-500">Chief Forensics Custodian Signature</span>
                  </div>
                  <div className="border-t border-slate-400 pt-1 text-center">
                    <span className="text-slate-500">Supervising Evidence Auditor Signature</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
