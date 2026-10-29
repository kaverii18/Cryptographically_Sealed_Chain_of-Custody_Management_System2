/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Key,
  Plus,
  Check,
  Copy,
  UserCheck,
  Lock,
  Download,
  ShieldCheck,
  FileCode,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { OfficerIdentity } from '../types/custody';
import { generateEcdsaKeyPair, truncateHash } from '../lib/crypto';

interface ActorKeyManagerProps {
  officers: OfficerIdentity[];
  activeOfficer: OfficerIdentity | null;
  onSelectActiveOfficer: (id: string) => void;
  onSaveOfficer: (officer: OfficerIdentity) => void;
}

export const ActorKeyManager: React.FC<ActorKeyManagerProps> = ({
  officers,
  activeOfficer,
  onSelectActiveOfficer,
  onSaveOfficer,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // New Custodian Form
  const [name, setName] = useState('');
  const [badge, setBadge] = useState('');
  const [role, setRole] = useState('Digital Evidence Custodian');
  const [agency, setAgency] = useState('Forensics & Cyber Crime Division');

  const handleCopyKey = (keyText: string, id: string) => {
    navigator.clipboard.writeText(keyText);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  // Safe export of ONLY the public JWK (never private parameters)
  const handleDownloadPublicJwk = (officer: OfficerIdentity) => {
    const publicOnlyJwk = {
      kty: officer.publicKeyJwk.kty,
      crv: officer.publicKeyJwk.crv,
      x: officer.publicKeyJwk.x,
      y: officer.publicKeyJwk.y,
      alg: 'ES256',
      use: 'sig',
      kid: officer.badge,
    };

    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(publicOnlyJwk, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `public_key_${officer.name.replace(/\s+/g, '_').toLowerCase()}.jwk.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleGenerateNewOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !badge.trim()) return;

    setIsGenerating(true);
    try {
      const keyPair = await generateEcdsaKeyPair();
      const newOfficer: OfficerIdentity = {
        id: crypto.randomUUID(),
        name: name.trim(),
        badge: badge.trim(),
        role: role.trim(),
        agency: agency.trim(),
        publicKeyJwk: keyPair.publicJwk,
        privateKeyJwk: keyPair.privateJwk,
        publicKeyHex: keyPair.publicKeyHex,
        createdAt: new Date().toISOString(),
      };

      onSaveOfficer(newOfficer);
      onSelectActiveOfficer(newOfficer.id);
      setShowNewModal(false);
      setName('');
      setBadge('');
    } catch (err) {
      console.error('Key generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-purple-400 font-mono mb-1">
              <span>CRYPTOGRAPHIC IDENTITY AUTHORITY</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-400">ECDSA NIST P-256 (secp256r1)</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Actor & Custodian Key Management
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Manage authorized forensic actors and cryptographic keypairs. Each custody transfer is digitally signed using an ECDSA private key. Public keys are stored in the ledger for judicial verification.
            </p>
          </div>

          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded transition-colors whitespace-nowrap shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Generate Custodian Keypair</span>
          </button>
        </div>
      </div>

      {/* Security Invariant Callout */}
      <div className="p-3 bg-purple-950/20 border border-purple-800/30 rounded-lg text-xs text-purple-200 flex items-start gap-2.5">
        <Lock className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
        <div>
          <strong className="block text-purple-100 font-semibold mb-0.5">
            Cryptographic Key Isolation Policy:
          </strong>
          <span>
            Private keys are maintained securely in client memory via Web Crypto API and utilized strictly for signing custody actions. Raw private key material (JWK 'd' parameter) is never displayed in the user interface, never written to console logs, and never exported in public certificates.
          </span>
        </div>
      </div>

      {/* Custodians Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {officers.map((officer) => {
          const isActive = officer.id === activeOfficer?.id;

          return (
            <div
              key={officer.id}
              className={`bg-white border rounded-lg p-5 flex flex-col justify-between transition-all ${
                isActive
                  ? 'border-purple-600 ring-1 ring-purple-600 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-800 font-mono">{officer.badge}</span>
                      <span aria-hidden="true">·</span>
                      <span>{officer.agency}</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">{officer.name}</h3>
                    <p className="text-xs text-slate-600">{officer.role}</p>
                  </div>

                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-900 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                      <UserCheck className="w-3 h-3 text-purple-700" />
                      <span>Active Signer</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => onSelectActiveOfficer(officer.id)}
                      className="text-xs text-purple-600 hover:text-purple-800 underline font-medium"
                    >
                      Set as Active Signer
                    </button>
                  )}
                </div>

                {/* ECDSA Public Key Display */}
                <div className="mt-3 p-3 bg-slate-900 rounded border border-slate-800 text-xs space-y-1.5 font-mono">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span className="flex items-center gap-1 text-purple-400">
                      <Lock className="w-3 h-3" />
                      <span>Public Key (P-256 SPKI)</span>
                    </span>
                    <button
                      onClick={() => handleCopyKey(officer.publicKeyHex, officer.id)}
                      className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-[10px]"
                      title="Copy Public Key Hex"
                    >
                      {copiedKeyId === officer.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Hex</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-slate-300 text-[11px] break-all select-all max-h-16 overflow-y-auto">
                    {officer.publicKeyHex}
                  </div>
                </div>
              </div>

              {/* Safe Export Options & Key Meta */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownloadPublicJwk(officer)}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-medium transition-colors"
                    title="Export Public JWK (no private material)"
                  >
                    <Download className="w-3 h-3 text-slate-600" />
                    <span>Export Public JWK</span>
                  </button>
                </div>
                <span>Curve: NIST P-256</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal to Generate New Key */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">Generate Custodian Keypair</h3>
              </div>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerateNewOfficer} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name & Title</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Special Agent Nathan Cross"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Badge / Examiner ID</label>
                <input
                  type="text"
                  required
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  placeholder="e.g. BADGE #5019"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-purple-600 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Role / Unit</label>
                <input
                  type="text"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Senior Digital Forensics Examiner"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Agency / Organization</label>
                <input
                  type="text"
                  required
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                  placeholder="e.g. State Department of Justice"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-600 text-[11px]">
                Upon confirmation, the Web Crypto API generates an authentic ECDSA P-256 keypair in your browser. The private key remains securely isolated.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3 py-1.5 text-slate-700 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="px-4 py-1.5 text-white bg-purple-600 hover:bg-purple-700 rounded font-semibold disabled:opacity-50"
                >
                  {isGenerating ? 'Generating P-256 Key...' : 'Generate Keypair'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
