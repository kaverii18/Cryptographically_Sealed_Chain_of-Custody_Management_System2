/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  FileSearch,
  Upload,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Check,
} from 'lucide-react';
import { EvidenceRecord, ChainVerificationResult } from '../types/custody';
import {
  verifyCompleteChain,
  computeSha256OfFile,
  truncateHash,
} from '../lib/crypto';

interface ForensicVerificationModuleProps {
  evidence: EvidenceRecord;
  evidenceList: EvidenceRecord[];
  onSelectEvidence: (id: string) => void;
  onUpdateEvidence: (updated: EvidenceRecord) => void;
  onResetChainToOriginal: () => void;
}

export const ForensicVerificationModule: React.FC<ForensicVerificationModuleProps> = ({
  evidence,
  evidenceList,
  onSelectEvidence,
  onUpdateEvidence,
  onResetChainToOriginal,
}) => {
  const [verificationResult, setVerificationResult] = useState<ChainVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // File re-verification
  const [recheckFile, setRecheckFile] = useState<File | null>(null);
  const [recheckHash, setRecheckHash] = useState<string>('');
  const [isHashingFile, setIsHashingFile] = useState<boolean>(false);

  // Tamper Sandbox Controls
  const [tamperBlockIdx, setTamperBlockIdx] = useState<number>(1);
  const [tamperType, setTamperType] = useState<'timestamp' | 'to' | 'notes' | 'signature' | 'prevHash'>('timestamp');
  const [tamperSuccessNotice, setTamperSuccessNotice] = useState<string | null>(null);

  // Run audit on mount or when evidence changes
  const runAudit = async (customFileHash?: string) => {
    if (!evidence) return;
    setIsVerifying(true);
    try {
      const result = await verifyCompleteChain(evidence, customFileHash || recheckHash || undefined);
      setVerificationResult(result);
    } catch (err) {
      console.error('Audit execution error:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    runAudit();
  }, [evidence]);

  const handleRecheckFile = async (file: File) => {
    setRecheckFile(file);
    setIsHashingFile(true);
    try {
      const computed = await computeSha256OfFile(file);
      setRecheckHash(computed);
      await runAudit(computed);
    } catch (err) {
      console.error('File re-hash failed:', err);
    } finally {
      setIsHashingFile(false);
    }
  };

  const handleApplyTamper = () => {
    const chainCopy = JSON.parse(JSON.stringify(evidence.custodyChain));
    if (tamperBlockIdx >= chainCopy.length) return;

    const target = chainCopy[tamperBlockIdx];

    switch (tamperType) {
      case 'timestamp': {
        const originalDate = new Date(target.timestamp);
        originalDate.setDate(originalDate.getDate() - 3);
        target.timestamp = originalDate.toISOString();
        setTamperSuccessNotice(`Altered Block #${tamperBlockIdx} timestamp to backdated time (-3 days).`);
        break;
      }
      case 'to': {
        target.to = 'Unauthorized Third Party (Exfiltration Attempt)';
        setTamperSuccessNotice(`Altered Block #${tamperBlockIdx} recipient to unauthorized party.`);
        break;
      }
      case 'notes': {
        target.notes = '[TAMPERED] Evidence seal broken; contents inspected without authorization.';
        setTamperSuccessNotice(`Modified notes and physical condition on Block #${tamperBlockIdx}.`);
        break;
      }
      case 'signature': {
        target.signatureHex = 'ff' + target.signatureHex.slice(2);
        setTamperSuccessNotice(`Corrupted digital ECDSA signature byte sequence on Block #${tamperBlockIdx}.`);
        break;
      }
      case 'prevHash': {
        target.previousEntryHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        setTamperSuccessNotice(`Severed hash chain pointer on Block #${tamperBlockIdx}.`);
        break;
      }
    }

    const modifiedEvidence: EvidenceRecord = {
      ...evidence,
      custodyChain: chainCopy,
    };

    onUpdateEvidence(modifiedEvidence);
  };

  const isChainTampered = verificationResult ? !verificationResult.isValid : false;

  return (
    <div className="space-y-6">
      {/* Top Banner & Case Selector */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <span>Forensic Verification & Audit Suite</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-slate-700">Target Case:</span>
              <select
                aria-label="Target Case File Selector"
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
            </div>
            <h1 className="text-xl font-bold text-slate-900">Forensic Chain Integrity Verification</h1>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl">
              Verifies the 3 cryptographic guarantees: Root Evidence SHA-256 match, consecutive hash pointer continuity, and Web Crypto ECDSA digital signatures.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => runAudit()}
              disabled={isVerifying}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
              <span>Re-run Full Audit</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Audit Status Verdict Banner */}
      {verificationResult && (
        <div
          className={`p-6 rounded-lg border transition-colors ${
            verificationResult.isValid
              ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
              : 'bg-rose-50/60 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
                  verificationResult.isValid
                    ? 'bg-emerald-600 text-white'
                    : 'bg-rose-600 text-white'
                }`}
              >
                {verificationResult.isValid ? (
                  <ShieldCheck className="w-7 h-7" />
                ) : (
                  <ShieldAlert className="w-7 h-7" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <span
                    className={`px-2.5 py-0.5 text-xs font-black uppercase tracking-wider rounded font-mono ${
                      verificationResult.isValid
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    {verificationResult.isValid ? 'VERIFIED' : 'TAMPERED / FAILED'}
                  </span>
                  <h2 className="text-lg font-bold">
                    {verificationResult.isValid
                      ? 'Chain Integrity Sealed & Admissible'
                      : 'Cryptographic Tampering Detected! Chain Invalid'}
                  </h2>
                </div>
                <p className="text-xs mt-1 text-slate-700">
                  {verificationResult.isValid
                    ? 'All SHA-256 block hashes, parent pointers, and ECDSA digital signatures passed strict Web Crypto API verification. The chain of custody is untampered and mathematically continuous.'
                    : verificationResult.failureSummary ||
                      'One or more blocks failed cryptographic verification. Data was modified after signing or hash chain was severed.'}
                </p>

                {verificationResult.tamperedBlockIndex !== undefined && (
                  <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1 bg-rose-100 border border-rose-300 text-rose-900 rounded font-semibold text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Compromised Block Index: #{verificationResult.tamperedBlockIndex}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Audit Checklist Badges */}
            <div className="flex flex-col gap-2 shrink-0 border-t md:border-t-0 md:border-l border-slate-300/60 pt-3 md:pt-0 md:pl-5 text-xs">
              <div className="flex items-center gap-2">
                {verificationResult.genesisRootValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>Root Evidence Integrity</span>
              </div>

              <div className="flex items-center gap-2">
                {verificationResult.chainContinuityValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>Hash Continuity (Parent Links)</span>
              </div>

              <div className="flex items-center gap-2">
                {verificationResult.allSignaturesValid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>Web Crypto ECDSA Signatures</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid: 1) Physical File Re-verification & 2) Tamper Simulator Sandbox */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Re-Verify Original Evidence File */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FileSearch className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-bold text-slate-900">Re-verify Physical File SHA-256</h3>
          </div>
          <p className="text-xs text-slate-600">
            Select or drag the suspect evidence file to compute its current SHA-256 hash in your browser and compare against the genesis registration hash.
          </p>

          <label className="border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-lg p-4 text-center cursor-pointer block bg-slate-50/50 transition-colors">
            <input
              type="file"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleRecheckFile(e.target.files[0]);
                }
              }}
              className="hidden"
            />
            <Upload className="w-6 h-6 mx-auto text-slate-400 mb-1" />
            <span className="text-xs font-semibold text-slate-800">
              {isHashingFile ? 'Hashing in browser...' : 'Click to select evidence file for re-hash'}
            </span>
          </label>

          {/* Hash Comparison Box */}
          <div className="space-y-2 text-xs pt-1">
            <div>
              <span className="text-slate-500 font-medium block">Registered Root Hash (Genesis):</span>
              <div className="p-2 bg-slate-100 text-slate-900 font-mono text-[11px] rounded break-all select-all">
                {evidence.sha256Hash}
              </div>
            </div>

            {recheckHash && (
              <div>
                <span className="text-slate-500 font-medium block flex items-center justify-between">
                  <span>Re-computed Hash from Uploaded File:</span>
                  <span
                    className={`font-semibold ${
                      recheckHash.toLowerCase() === evidence.sha256Hash.toLowerCase()
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {recheckHash.toLowerCase() === evidence.sha256Hash.toLowerCase()
                      ? '✓ MATCH CONFIRMED'
                      : '✕ HASH MISMATCH'}
                  </span>
                </span>
                <div
                  className={`p-2 font-mono text-[11px] rounded break-all select-all ${
                    recheckHash.toLowerCase() === evidence.sha256Hash.toLowerCase()
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                      : 'bg-rose-50 text-rose-900 border border-rose-300'
                  }`}
                >
                  {recheckHash}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Interactive Tamper Demonstration Workbench */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-bold text-slate-900">Tamper Demonstration Sandbox</h3>
            </div>
            {isChainTampered && (
              <button
                onClick={onResetChainToOriginal}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded border border-emerald-300 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Valid Chain</span>
              </button>
            )}
          </div>

          <p className="text-xs text-slate-600">
            Simulate realistic malicious modifications (e.g. backdating a custody record, forging a recipient, or editing notes) to observe how cryptographic hashing and ECDSA signatures catch tampering.
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Block</label>
              <select
                aria-label="Tamper Target Block"
                value={tamperBlockIdx}
                onChange={(e) => setTamperBlockIdx(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded focus:outline-none"
              >
                {evidence.custodyChain.map((b) => (
                  <option key={b.id} value={b.index}>
                    Block #{b.index} ({b.action.slice(0, 20)}...)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tamper Vector</label>
              <select
                aria-label="Tamper Vector Type"
                value={tamperType}
                onChange={(e) => setTamperType(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded focus:outline-none"
              >
                <option value="timestamp">Backdate Timestamp (-3 Days)</option>
                <option value="to">Modify Recipient Custodian</option>
                <option value="notes">Alter Notes / Seal Condition</option>
                <option value="signature">Corrupt Digital Signature</option>
                <option value="prevHash">Sever Previous Hash Pointer</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleApplyTamper}
            className="w-full py-2 px-3 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded transition-colors flex items-center justify-center gap-1.5"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>Inject Tampering & Test Detector</span>
          </button>

          {tamperSuccessNotice && (
            <p className="text-xs text-slate-500 italic text-center">{tamperSuccessNotice}</p>
          )}
        </div>
      </div>

      {/* Block-by-Block Cryptographic Verification Audit Results */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Block-by-Block Cryptographic Audit Trail
          </h3>
          <p className="text-xs text-slate-500">
            Detailed validation metrics verifying SHA-256 hash calculation, parent link integrity, and ECDSA signature match for each custody link
          </p>
        </div>

        <div className="space-y-3">
          {verificationResult?.blockResults.map((status) => {
            const hasError = !status.hashesMatch || !status.prevHashMatchesPrior || !status.signatureValid;
            const isGenesis = status.index === 0;

            return (
              <div
                key={status.id}
                className={`p-4 rounded-lg border text-xs transition-colors ${
                  hasError
                    ? 'bg-rose-50/70 border-rose-300 text-rose-950'
                    : 'bg-slate-50/60 border-slate-200 text-slate-900'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                        hasError
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-900 text-white'
                      }`}
                    >
                      Block #{status.index}
                    </span>
                    <span className="font-semibold">{status.action}</span>
                    {isGenesis && (
                      <span className="text-[11px] text-emerald-700 font-medium">
                        · Genesis Intake
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      {status.prevHashMatchesPrior ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      )}
                      <span className="text-[11px] text-slate-600">Chain Link</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {status.signatureValid ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      )}
                      <span className="text-[11px] text-slate-600">ECDSA Signature</span>
                    </div>
                  </div>
                </div>

                {/* Hashes and Diagnostics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500 font-sans block mb-0.5">Stored Block Hash:</span>
                    <div className="p-1.5 bg-slate-900 text-slate-200 rounded break-all select-all">
                      {status.storedEntryHash}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-500 font-sans block mb-0.5">
                      Re-computed Block Hash:
                    </span>
                    <div
                      className={`p-1.5 rounded break-all select-all ${
                        status.hashesMatch
                          ? 'bg-slate-900 text-emerald-400'
                          : 'bg-rose-900 text-rose-100 font-bold'
                      }`}
                    >
                      {status.computedEntryHash}
                    </div>
                  </div>
                </div>

                {status.errorDetails && (
                  <div className="mt-2.5 p-2.5 bg-rose-100 border border-rose-300 rounded text-rose-900 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block">Integrity Check Failed:</strong>
                      <span>{status.errorDetails}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
