/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Upload,
  File,
  CheckCircle2,
  AlertCircle,
  Shield,
  Lock,
  ArrowRight,
  QrCode,
  Printer,
  Download,
  Copy,
  Check,
  Tag,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { EvidenceRecord, CustodyEntry, OfficerIdentity } from '../types/custody';
import {
  computeSha256OfFile,
  formatBytes,
  GENESIS_PREVIOUS_HASH,
  buildCanonicalPayload,
  computeSha256OfString,
  signCanonicalData,
  truncateHash,
} from '../lib/crypto';

interface EvidenceIntakeProps {
  onSaveEvidence: (newRecord: EvidenceRecord) => void;
  officers: OfficerIdentity[];
  activeOfficer: OfficerIdentity | null;
  onCancel?: () => void;
}

export const EvidenceIntake: React.FC<EvidenceIntakeProps> = ({
  onSaveEvidence,
  officers,
  activeOfficer,
  onCancel,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<string>('');
  const [isHashing, setIsHashing] = useState<boolean>(false);
  const [hashProgress, setHashProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Form Fields
  const [caseNumber, setCaseNumber] = useState<string>('CR-2026-9042');
  const [evidenceNumber, setEvidenceNumber] = useState<string>(
    `EV-${Math.floor(10000 + Math.random() * 90000)}`
  );
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>(
    activeOfficer?.id || officers[0]?.id || ''
  );
  const [location, setLocation] = useState<string>('Central Intake & Forensics Vault, Bay 1');
  const [notes, setNotes] = useState<string>(
    'Evidence secured in tamper-evident bag. Barcode verified.'
  );
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSealing, setIsSealing] = useState<boolean>(false);

  // QR Code Generation State
  const [qrFormat, setQrFormat] = useState<'structured' | 'json'>('structured');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);
  const [labelCanvasUrl, setLabelCanvasUrl] = useState<string | null>(null);

  // Success summary modal state
  const [sealedRecord, setSealedRecord] = useState<EvidenceRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const labelPrintRef = useRef<HTMLDivElement>(null);

  const signingOfficer = officers.find((o) => o.id === selectedOfficerId) || officers[0];

  // Construct QR Payload text
  const getQrPayloadString = () => {
    const cleanEvidenceId = evidenceNumber.trim() || 'EV-PENDING';
    const cleanGenesisHash = hash.trim() || 'SHA256-PENDING-FILE-SELECTION';
    const cleanCaseNumber = caseNumber.trim() || 'CASE-PENDING';

    if (qrFormat === 'json') {
      return JSON.stringify({
        evidenceId: cleanEvidenceId,
        genesisHash: cleanGenesisHash,
        caseNumber: cleanCaseNumber,
        algorithm: 'SHA-256',
        standard: 'FIPS 186-4',
      });
    }

    return `EVIDENCE-ID: ${cleanEvidenceId}\nGENESIS-HASH: ${cleanGenesisHash}\nCASE: ${cleanCaseNumber}\nSEAL: ECDSA-P256`;
  };

  // Generate QR Code image when hash, evidenceNumber, caseNumber, or format changes
  useEffect(() => {
    let isCancelled = false;

    async function generateQr() {
      const payload = getQrPayloadString();
      try {
        const url = await QRCode.toDataURL(payload, {
          width: 280,
          margin: 2,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'M',
        });

        if (!isCancelled) {
          setQrDataUrl(url);
        }
      } catch (err) {
        console.error('Failed to generate QR Code:', err);
      }
    }

    generateQr();

    return () => {
      isCancelled = true;
    };
  }, [evidenceNumber, hash, caseNumber, qrFormat]);

  // Handle file selection
  const handleFileSelection = async (selectedFile: File) => {
    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
    }
    setIsHashing(true);
    setHashProgress(10);
    setErrorMsg('');

    try {
      const computedHash = await computeSha256OfFile(selectedFile, (pct) => {
        setHashProgress(pct);
      });
      setHash(computedHash);
    } catch (err) {
      console.error('File hashing error:', err);
      setErrorMsg('Failed to compute SHA-256 hash. Please retry with a valid file.');
    } finally {
      setIsHashing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(getQrPayloadString());
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  // Print physical evidence label directly
  const handlePrintLabel = () => {
    window.print();
  };

  // Download Physical Evidence Tag PNG (Thermal label / sticker format)
  const handleDownloadLabelImage = () => {
    if (!qrDataUrl) return;

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 600, 360);

    // Border
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 584, 344);

    // Header banner
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(10, 10, 580, 48);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('PHYSICAL EVIDENCE IDENTIFIER LABEL', 24, 40);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('CRYPTOGRAPHICALLY SEALED CHAIN OF CUSTODY', 360, 40);

    // Text Details on Left
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('EVIDENCE ID:', 24, 85);
    ctx.font = 'bold 22px monospace';
    ctx.fillText(evidenceNumber.trim() || 'EV-PENDING', 24, 110);

    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('CASE NUMBER:', 24, 138);
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(caseNumber.trim() || 'CR-PENDING', 24, 158);

    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('TITLE / DESCRIPTION:', 24, 185);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#0f172a';
    const cleanTitle = (title.trim() || file?.name || 'Evidence Item').slice(0, 32);
    ctx.fillText(cleanTitle, 24, 204);

    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('GENESIS SHA-256 HASH:', 24, 230);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#047857';
    const hashStr = hash || 'AWAITING_FILE_HASH';
    ctx.fillText(hashStr.slice(0, 32), 24, 248);
    ctx.fillText(hashStr.slice(32), 24, 262);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`INTAKE DATE: ${new Date().toLocaleDateString()} | CUSTODIAN: ${signingOfficer?.name || 'Authorized'}`, 24, 300);
    ctx.fillText(`STORAGE LOC: ${location || 'Vault Bay 1'} | SEAL BAG: ${notes.slice(0, 24)}`, 24, 320);

    // Draw QR Code on Right
    const qrImg = new Image();
    qrImg.onload = () => {
      ctx.drawImage(qrImg, 380, 80, 195, 195);

      // Scannable caption
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('SCAN TO VERIFY HASH', 410, 295);

      ctx.fillStyle = '#64748b';
      ctx.font = '9px sans-serif';
      ctx.fillText('NIST P-256 / SHA-256 SEAL', 420, 312);

      const labelUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = labelUrl;
      a.download = `evidence_label_${evidenceNumber}_${caseNumber}.png`;
      a.click();
    };
    qrImg.src = qrDataUrl;
  };

  const handleSealAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !hash) {
      setErrorMsg('Please select an evidence file and compute its SHA-256 hash.');
      return;
    }
    if (!caseNumber.trim() || !evidenceNumber.trim() || !title.trim()) {
      setErrorMsg('Please fill in Case #, Evidence ID, and Title.');
      return;
    }

    if (!signingOfficer) {
      setErrorMsg('No valid custodian identity available for digital signing.');
      return;
    }

    setIsSealing(true);
    setErrorMsg('');

    try {
      const intakeTime = new Date().toISOString();
      const evidenceId = crypto.randomUUID();

      // Construct Genesis Block (Block #0)
      const genesisPayload = buildCanonicalPayload({
        index: 0,
        previousEntryHash: GENESIS_PREVIOUS_HASH,
        evidenceHash: hash,
        action: 'Initial Evidence Seizure & Chain Intake',
        from: `Field Intake / Incident Scene (${caseNumber.trim()})`,
        to: signingOfficer.name,
        timestamp: intakeTime,
        location: location.trim(),
        notes: notes.trim(),
        signerPublicKeyHex: signingOfficer.publicKeyHex,
      });

      const genesisHash = await computeSha256OfString(genesisPayload);
      const genesisSignatureHex = await signCanonicalData(
        genesisPayload,
        signingOfficer.privateKeyJwk
      );

      const genesisEntry: CustodyEntry = {
        id: crypto.randomUUID(),
        index: 0,
        timestamp: intakeTime,
        action: 'Initial Evidence Seizure & Chain Intake',
        from: `Field Intake / Incident Scene (${caseNumber.trim()})`,
        to: signingOfficer.name,
        location: location.trim(),
        notes: notes.trim(),
        evidenceHash: hash,
        previousEntryHash: GENESIS_PREVIOUS_HASH,
        entryHash: genesisHash,
        canonicalPayload: genesisPayload,
        signatureHex: genesisSignatureHex,
        signer: {
          name: signingOfficer.name,
          badge: signingOfficer.badge,
          role: signingOfficer.role,
          agency: signingOfficer.agency,
          publicKeyJwk: signingOfficer.publicKeyJwk,
          publicKeyHex: signingOfficer.publicKeyHex,
        },
      };

      const record: EvidenceRecord = {
        id: evidenceId,
        caseNumber: caseNumber.trim(),
        evidenceNumber: evidenceNumber.trim(),
        title: title.trim(),
        description: description.trim(),
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        sha256Hash: hash,
        intakeTimestamp: intakeTime,
        intakeOfficer: signingOfficer.name,
        currentCustodian: signingOfficer.name,
        storageLocation: location.trim(),
        custodyChain: [genesisEntry],
      };

      setSealedRecord(record);
      onSaveEvidence(record);
    } catch (err) {
      console.error('Failed to seal genesis custody block:', err);
      setErrorMsg('Cryptographic sealing failed during ECDSA signing. Check browser crypto permissions.');
    } finally {
      setIsSealing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Evidence Intake & Physical Labeling</h1>
              <p className="text-xs text-slate-500">
                Compute browser-side SHA-256 hash, generate scannable physical QR label, and seal Genesis Block #0 via ECDSA P-256.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5" />
              <span>Live QR Evidence Tag Ready</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Form on Left + Live Physical Evidence QR Label on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Intake Details Form (7 Cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 shadow-xs">
          <form onSubmit={handleSealAndSubmit} className="space-y-5">
            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 1. Digital File Hashing */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                1. Evidence File (SHA-256 Digest Computed in Browser) <span className="text-rose-500">*</span>
              </label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileSelection(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              {!file ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-emerald-500 bg-emerald-50/50'
                      : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
                  }`}
                >
                  <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-semibold text-slate-800">
                    Drag and drop file here, or <span className="text-emerald-700 underline">browse</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Raw disk images (.dd/.E01), TAR/ZIP, database dumps, documents, video, forensic photos
                  </p>
                </div>
              ) : (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 truncate">
                      <File className="w-6 h-6 text-slate-600 shrink-0" />
                      <div className="truncate">
                        <p className="text-sm font-bold text-slate-900 truncate">{file.name}</p>
                        <p className="text-xs text-slate-500">
                          {formatBytes(file.size)} · {file.type || 'octet-stream'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setHash('');
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 underline ml-2 shrink-0"
                    >
                      Change File
                    </button>
                  </div>

                  {/* Hash Status */}
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    {isHashing ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>Computing SHA-256 via Web Crypto...</span>
                          <span className="font-mono">{hashProgress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-200"
                            style={{ width: `${hashProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : hash ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Initial Genesis Hash (SHA-256):</span>
                        </div>
                        <div className="p-2 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded break-all select-all">
                          {hash}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Identifiers */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                2. Case & Evidence Identifiers
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Evidence ID / Barcode <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={evidenceNumber}
                    onChange={(e) => setEvidenceNumber(e.target.value)}
                    placeholder="e.g. EV-88419"
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Encoded into physical QR label
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Case Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={caseNumber}
                    onChange={(e) => setCaseNumber(e.target.value)}
                    placeholder="e.g. CR-2026-9042"
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Evidence Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Primary Suspect Laptop NVMe SSD"
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description & Context
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Physical markings, make/model, condition, write-blocker serial..."
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            {/* 3. Custody & Storage Assignment */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                3. Initial Storage & Custodian
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Intake Custodian (ECDSA Signer)
                  </label>
                  <select
                    value={selectedOfficerId}
                    onChange={(e) => setSelectedOfficerId(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                  >
                    {officers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.badge})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Secure Storage Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tamper-Evident Bag & Seal Serial #
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Cryptographic Genesis Callout */}
            <div className="p-3 bg-slate-900 text-slate-300 rounded-lg text-xs space-y-1 border border-slate-800">
              <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                <Lock className="w-3.5 h-3.5" />
                <span>Genesis Block #0 Digital Sealing Protocol</span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Upon submission, Block #0 is signed via Web Crypto ECDSA (P-256) and rooted to parent hash{' '}
                <code className="text-slate-200 font-mono">00000000...</code>.
              </p>
            </div>

            {/* Submit Action */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={!file || !hash || isHashing || isSealing}
                className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:pointer-events-none rounded transition-colors shadow-sm"
              >
                <span>{isSealing ? 'Sealing Genesis Block...' : 'Seal & Register Evidence'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Physical Evidence Label & QR Code Generator (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">Physical Evidence Label</h3>
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setQrFormat('structured')}
                  className={`px-2 py-0.5 rounded ${
                    qrFormat === 'structured'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => setQrFormat('json')}
                  className={`px-2 py-0.5 rounded ${
                    qrFormat === 'json'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  JSON
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Scannable QR code encoding the Evidence ID and initial Genesis SHA-256 hash for affixing to tamper-evident evidence bags, hard drive antistatic pouches, or forensic lockboxes.
            </p>

            {/* The Physical Evidence Label Graphic Card (Printable & Downloadable) */}
            <div
              ref={labelPrintRef}
              className="bg-white border-2 border-slate-900 rounded-lg p-4 space-y-3 shadow-sm text-slate-900"
            >
              {/* Label Top Bar */}
              <div className="bg-slate-900 text-white px-3 py-1.5 rounded flex items-center justify-between text-[11px] font-mono">
                <span className="font-bold tracking-wider">PHYSICAL EVIDENCE LABEL</span>
                <span className="text-emerald-400">SEALED CHAIN</span>
              </div>

              {/* Center Content: QR Code Graphic + Meta */}
              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* Crisp Scannable QR Code */}
                <div className="bg-white p-2 border border-slate-300 rounded shadow-2xs shrink-0 flex flex-col items-center">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Scannable Evidence Genesis QR Code"
                      className="w-36 h-36 object-contain"
                    />
                  ) : (
                    <div className="w-36 h-36 bg-slate-100 rounded flex items-center justify-center text-slate-400">
                      <QrCode className="w-10 h-10 animate-pulse" />
                    </div>
                  )}
                  <span className="text-[9px] font-mono font-bold text-slate-700 mt-1">
                    SCAN TO VERIFY HASH
                  </span>
                </div>

                {/* Tag Key Data */}
                <div className="space-y-1.5 text-xs flex-1 w-full">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Evidence ID:
                    </span>
                    <span className="font-mono text-base font-black text-slate-900 tracking-tight">
                      {evidenceNumber.trim() || 'EV-PENDING'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Case Number:
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-800">
                      {caseNumber.trim() || 'CR-PENDING'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">
                      Genesis Root Hash:
                    </span>
                    <code className="font-mono text-[10px] text-emerald-800 font-semibold break-all select-all block bg-slate-50 p-1 rounded border border-slate-200">
                      {hash ? truncateHash(hash, 8, 8) : 'Awaiting file hashing...'}
                    </code>
                  </div>
                </div>
              </div>

              {/* Label Footer */}
              <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-600 flex items-center justify-between font-mono">
                <span>INTAKE: {new Date().toLocaleDateString()}</span>
                <span>SIGNER: {signingOfficer?.name.slice(0, 16)}</span>
              </div>
            </div>

            {/* QR Label Actions */}
            <div className="flex flex-col gap-2 pt-1 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadLabelImage}
                  disabled={!qrDataUrl}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Tag PNG</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintLabel}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Sticky Label</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyPayload}
                className="w-full py-1.5 px-3 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition-colors flex items-center justify-center gap-1.5"
              >
                {copiedPayload ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied Scannable QR Payload to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Encoded QR Payload Text</span>
                  </>
                )}
              </button>
            </div>

            {/* Scanned Payload Preview Drawer */}
            <div className="pt-3 border-t border-slate-100 space-y-1 text-xs">
              <span className="font-semibold text-slate-700 block text-[11px]">
                Encoded Payload (Physical Barcode Reader Output):
              </span>
              <pre className="p-2 bg-slate-950 text-slate-300 font-mono text-[10px] rounded whitespace-pre-wrap break-all select-all">
                {getQrPayloadString()}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
