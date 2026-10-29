/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Key, Plus, Check, Copy, UserCheck, Lock } from 'lucide-react';
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
  const [role, setRole] = useState('Evidence Custodian');
  const [agency, setAgency] = useState('Metropolitan Police Dept');

  const handleCopyKey = (keyText: string, id: string) => {
    navigator.clipboard.writeText(keyText);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
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
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <span>Cryptographic Identity Authority</span>
              <span aria-hidden="true">·</span>
              <span>Web Crypto API (ECDSA P-256)</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">Custodian & Actor Key Management</h1>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl">
              Each custody transfer must be signed with an authentic ECDSA private key. Public keys are registered and stored in the chain for independent cryptographic verification.
            </p>
          </div>

          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors whitespace-nowrap shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Generate Custodian Keypair</span>
          </button>
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
                  ? 'border-emerald-600 ring-1 ring-emerald-600 shadow-sm'
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
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded">
                      <UserCheck className="w-3 h-3 text-emerald-700" />
                      <span>Active Signer</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => onSelectActiveOfficer(officer.id)}
                      className="text-xs text-slate-600 hover:text-slate-900 underline font-medium"
                    >
                      Set as Signer
                    </button>
                  )}
                </div>

                {/* ECDSA Public Key Display */}
                <div className="mt-3 p-3 bg-slate-900 rounded border border-slate-800 text-xs space-y-1.5 font-mono">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span className="flex items-center gap-1 text-emerald-400">
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

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>Registered: {new Date(officer.createdAt).toLocaleDateString()}</span>
                <span>Curve: NIST P-256 (secp256r1)</span>
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
                <Key className="w-5 h-5 text-emerald-600" />
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
                  placeholder="e.g. Officer Nathan Cross"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
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
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Role / Department</label>
                <input
                  type="text"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Senior Digital Forensics Examiner"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
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
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-600 text-[11px]">
                Upon generation, the Web Crypto API creates an ECDSA P-256 private/public keypair inside your browser. The private key never leaves client memory.
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
                  className="px-4 py-1.5 text-white bg-slate-900 hover:bg-slate-800 rounded font-semibold disabled:opacity-50"
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
