/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CustodyEntry, EvidenceRecord, OfficerIdentity } from '../types/custody';
import {
  buildCanonicalPayload,
  computeSha256OfString,
  GENESIS_PREVIOUS_HASH,
  generateEcdsaKeyPair,
  signCanonicalData,
} from './crypto';

export interface PredefinedOfficerSeed {
  name: string;
  badge: string;
  role: string;
  agency: string;
}

export const DEFAULT_OFFICER_SEEDS: PredefinedOfficerSeed[] = [
  {
    name: 'Det. Marcus Vance',
    badge: 'BADGE #4082',
    role: 'Lead Digital Crime Investigator',
    agency: 'Metropolitan Police Dept - Cyber Division',
  },
  {
    name: 'Dr. Evelyn Reed',
    badge: 'EXAM #1094',
    role: 'Supervising Digital Forensics Examiner',
    agency: 'State Bureau of Investigation - Forensics Lab',
  },
  {
    name: 'Agent Sarah Connor',
    badge: 'FED-VAULT #88',
    role: 'Chief Vault Custodian',
    agency: 'Central Evidence Repository & Secure Archives',
  },
  {
    name: 'Prosecutor Julian Mercer',
    badge: 'BAR #99201',
    role: 'Senior Assistant District Attorney',
    agency: 'District Attorney’s Office - Major Crimes',
  },
];

/**
 * Generate cryptographic identities and seed sample evidence records with valid signatures and chained hashes
 */
export async function generateInitialIdentitiesAndEvidence(): Promise<{
  officers: OfficerIdentity[];
  evidenceList: EvidenceRecord[];
}> {
  // 1. Generate real ECDSA keys for officers
  const officers: OfficerIdentity[] = [];
  for (const seed of DEFAULT_OFFICER_SEEDS) {
    const keyPair = await generateEcdsaKeyPair();
    officers.push({
      id: crypto.randomUUID(),
      name: seed.name,
      badge: seed.badge,
      role: seed.role,
      agency: seed.agency,
      publicKeyJwk: keyPair.publicJwk,
      privateKeyJwk: keyPair.privateJwk,
      publicKeyHex: keyPair.publicKeyHex,
      createdAt: '2026-09-01T08:00:00.000Z',
    });
  }

  const [vance, reed, connor, mercer] = officers;

  // 2. Generate Evidence 1: Seized BitLocker Encrypted NVMe SSD
  const case1Sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // standard known hash seed
  const evidence1Id = crypto.randomUUID();

  // Create Chain for Evidence 1
  const chain1: CustodyEntry[] = [];

  // Entry 0 (Genesis)
  const entry0Payload = buildCanonicalPayload({
    index: 0,
    previousEntryHash: GENESIS_PREVIOUS_HASH,
    evidenceHash: case1Sha256,
    action: 'Initial Evidence Seizure & Intake',
    from: 'Field Scene (Suite 400, 100 Financial Way)',
    to: vance.name,
    timestamp: '2026-10-10T14:22:00.000Z',
    location: 'Metropolitan Police Dept - Cyber Lab Intake',
    notes: 'Samsung 980 Pro 2TB NVMe SSD placed in anti-static tamper-evident bag #EV-88419.',
    signerPublicKeyHex: vance.publicKeyHex,
  });
  const entry0Hash = await computeSha256OfString(entry0Payload);
  const entry0Sig = await signCanonicalData(entry0Payload, vance.privateKeyJwk);

  chain1.push({
    id: crypto.randomUUID(),
    index: 0,
    timestamp: '2026-10-10T14:22:00.000Z',
    action: 'Initial Evidence Seizure & Intake',
    from: 'Field Scene (Suite 400, 100 Financial Way)',
    to: vance.name,
    location: 'Metropolitan Police Dept - Cyber Lab Intake',
    notes: 'Samsung 980 Pro 2TB NVMe SSD placed in anti-static tamper-evident bag #EV-88419.',
    evidenceHash: case1Sha256,
    previousEntryHash: GENESIS_PREVIOUS_HASH,
    entryHash: entry0Hash,
    canonicalPayload: entry0Payload,
    signatureHex: entry0Sig,
    signer: {
      name: vance.name,
      badge: vance.badge,
      role: vance.role,
      agency: vance.agency,
      publicKeyJwk: vance.publicKeyJwk,
      publicKeyHex: vance.publicKeyHex,
    },
  });

  // Entry 1 (Transfer to Forensics Lab)
  const entry1Payload = buildCanonicalPayload({
    index: 1,
    previousEntryHash: entry0Hash,
    evidenceHash: case1Sha256,
    action: 'Physical Transfer to Forensics Lab',
    from: vance.name,
    to: reed.name,
    timestamp: '2026-10-11T09:15:00.000Z',
    location: 'State Forensics Forensic Cleanroom #2',
    notes: 'Custody transferred via secure courier dispatch #C-402. Tamper seal #EV-88419 verified intact.',
    signerPublicKeyHex: reed.publicKeyHex,
  });
  const entry1Hash = await computeSha256OfString(entry1Payload);
  const entry1Sig = await signCanonicalData(entry1Payload, reed.privateKeyJwk);

  chain1.push({
    id: crypto.randomUUID(),
    index: 1,
    timestamp: '2026-10-11T09:15:00.000Z',
    action: 'Physical Transfer to Forensics Lab',
    from: vance.name,
    to: reed.name,
    location: 'State Forensics Forensic Cleanroom #2',
    notes: 'Custody transferred via secure courier dispatch #C-402. Tamper seal #EV-88419 verified intact.',
    evidenceHash: case1Sha256,
    previousEntryHash: entry0Hash,
    entryHash: entry1Hash,
    canonicalPayload: entry1Payload,
    signatureHex: entry1Sig,
    signer: {
      name: reed.name,
      badge: reed.badge,
      role: reed.role,
      agency: reed.agency,
      publicKeyJwk: reed.publicKeyJwk,
      publicKeyHex: reed.publicKeyHex,
    },
  });

  // Entry 2 (Forensic Bit-Stream Acquisition)
  const entry2Payload = buildCanonicalPayload({
    index: 2,
    previousEntryHash: entry1Hash,
    evidenceHash: case1Sha256,
    action: 'Forensic Bit-Stream Image Extracted (E01 format)',
    from: reed.name,
    to: reed.name,
    timestamp: '2026-10-11T16:45:00.000Z',
    location: 'Forensics Workstation ALPHA-9',
    notes: 'Hardware write-blocker Tableau T8u engaged. Bit-stream disk image verified matching SHA-256 identical to source. Re-sealed in bag #EV-88420.',
    signerPublicKeyHex: reed.publicKeyHex,
  });
  const entry2Hash = await computeSha256OfString(entry2Payload);
  const entry2Sig = await signCanonicalData(entry2Payload, reed.privateKeyJwk);

  chain1.push({
    id: crypto.randomUUID(),
    index: 2,
    timestamp: '2026-10-11T16:45:00.000Z',
    action: 'Forensic Bit-Stream Image Extracted (E01 format)',
    from: reed.name,
    to: reed.name,
    location: 'Forensics Workstation ALPHA-9',
    notes: 'Hardware write-blocker Tableau T8u engaged. Bit-stream disk image verified matching SHA-256 identical to source. Re-sealed in bag #EV-88420.',
    evidenceHash: case1Sha256,
    previousEntryHash: entry1Hash,
    entryHash: entry2Hash,
    canonicalPayload: entry2Payload,
    signatureHex: entry2Sig,
    signer: {
      name: reed.name,
      badge: reed.badge,
      role: reed.role,
      agency: reed.agency,
      publicKeyJwk: reed.publicKeyJwk,
      publicKeyHex: reed.publicKeyHex,
    },
  });

  // Entry 3 (Vault Long-Term Storage)
  const entry3Payload = buildCanonicalPayload({
    index: 3,
    previousEntryHash: entry2Hash,
    evidenceHash: case1Sha256,
    action: 'Transfer to High-Security Vault Storage',
    from: reed.name,
    to: connor.name,
    timestamp: '2026-10-12T11:30:00.000Z',
    location: 'Central Vault Locker #V-419',
    notes: 'Logged into climate-controlled secure vault locker V-419. Dual biometric key access required.',
    signerPublicKeyHex: connor.publicKeyHex,
  });
  const entry3Hash = await computeSha256OfString(entry3Payload);
  const entry3Sig = await signCanonicalData(entry3Payload, connor.privateKeyJwk);

  chain1.push({
    id: crypto.randomUUID(),
    index: 3,
    timestamp: '2026-10-12T11:30:00.000Z',
    action: 'Transfer to High-Security Vault Storage',
    from: reed.name,
    to: connor.name,
    location: 'Central Vault Locker #V-419',
    notes: 'Logged into climate-controlled secure vault locker V-419. Dual biometric key access required.',
    evidenceHash: case1Sha256,
    previousEntryHash: entry2Hash,
    entryHash: entry3Hash,
    canonicalPayload: entry3Payload,
    signatureHex: entry3Sig,
    signer: {
      name: connor.name,
      badge: connor.badge,
      role: connor.role,
      agency: connor.agency,
      publicKeyJwk: connor.publicKeyJwk,
      publicKeyHex: connor.publicKeyHex,
    },
  });

  // Evidence 1 Record
  const evidence1: EvidenceRecord = {
    id: evidence1Id,
    caseNumber: 'CR-2026-9042',
    evidenceNumber: 'EV-88419',
    title: 'Seized Encrypted Samsung 980 NVMe SSD',
    description: 'Internal PCIe M.2 SSD recovered from suspect primary workstation. Contains financial ledger database and encrypted chat containers.',
    fileName: 'samsung_980_pro_raw_disk.raw',
    fileSize: 2147483648, // 2GB
    mimeType: 'application/octet-stream',
    sha256Hash: case1Sha256,
    intakeTimestamp: '2026-10-10T14:22:00.000Z',
    intakeOfficer: vance.name,
    currentCustodian: connor.name,
    storageLocation: 'Central Vault Locker #V-419',
    custodyChain: chain1,
  };

  // 3. Generate Evidence 2: Mobile Device Extraction
  const case2Sha256 = '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069';
  const evidence2Id = crypto.randomUUID();
  const chain2: CustodyEntry[] = [];

  const e2p0 = buildCanonicalPayload({
    index: 0,
    previousEntryHash: GENESIS_PREVIOUS_HASH,
    evidenceHash: case2Sha256,
    action: 'Mobile Phone Seizure & Faraday Shielding',
    from: 'Field Scene (Executive Office 12B)',
    to: vance.name,
    timestamp: '2026-10-14T08:10:00.000Z',
    location: 'Metropolitan Police Dept - Cyber Intake',
    notes: 'iPhone 15 Pro seized in powered-on flight mode; placed in BlackHole Faraday isolation pouch.',
    signerPublicKeyHex: vance.publicKeyHex,
  });
  const e2h0 = await computeSha256OfString(e2p0);
  const e2s0 = await signCanonicalData(e2p0, vance.privateKeyJwk);

  chain2.push({
    id: crypto.randomUUID(),
    index: 0,
    timestamp: '2026-10-14T08:10:00.000Z',
    action: 'Mobile Phone Seizure & Faraday Shielding',
    from: 'Field Scene (Executive Office 12B)',
    to: vance.name,
    location: 'Metropolitan Police Dept - Cyber Intake',
    notes: 'iPhone 15 Pro seized in powered-on flight mode; placed in BlackHole Faraday isolation pouch.',
    evidenceHash: case2Sha256,
    previousEntryHash: GENESIS_PREVIOUS_HASH,
    entryHash: e2h0,
    canonicalPayload: e2p0,
    signatureHex: e2s0,
    signer: {
      name: vance.name,
      badge: vance.badge,
      role: vance.role,
      agency: vance.agency,
      publicKeyJwk: vance.publicKeyJwk,
      publicKeyHex: vance.publicKeyHex,
    },
  });

  const e2p1 = buildCanonicalPayload({
    index: 1,
    previousEntryHash: e2h0,
    evidenceHash: case2Sha256,
    action: 'Physical Transfer to Cellebrite Extraction Station',
    from: vance.name,
    to: reed.name,
    timestamp: '2026-10-14T13:30:00.000Z',
    location: 'Digital Forensics Lab - Station 4',
    notes: 'Advanced physical dump acquired. File system extraction confirmed intact and sealed.',
    signerPublicKeyHex: reed.publicKeyHex,
  });
  const e2h1 = await computeSha256OfString(e2p1);
  const e2s1 = await signCanonicalData(e2p1, reed.privateKeyJwk);

  chain2.push({
    id: crypto.randomUUID(),
    index: 1,
    timestamp: '2026-10-14T13:30:00.000Z',
    action: 'Physical Transfer to Cellebrite Extraction Station',
    from: vance.name,
    to: reed.name,
    location: 'Digital Forensics Lab - Station 4',
    notes: 'Advanced physical dump acquired. File system extraction confirmed intact and sealed.',
    evidenceHash: case2Sha256,
    previousEntryHash: e2h0,
    entryHash: e2h1,
    canonicalPayload: e2p1,
    signatureHex: e2s1,
    signer: {
      name: reed.name,
      badge: reed.badge,
      role: reed.role,
      agency: reed.agency,
      publicKeyJwk: reed.publicKeyJwk,
      publicKeyHex: reed.publicKeyHex,
    },
  });

  const evidence2: EvidenceRecord = {
    id: evidence2Id,
    caseNumber: 'SEC-4410',
    evidenceNumber: 'EV-99021',
    title: 'Trade Secret Leak - Mobile Device TAR Backup',
    description: 'Full file system extraction containing corporate communications, Signal transcripts, and unauthorized document exports.',
    fileName: 'ios_filesystem_extraction.tar',
    fileSize: 4509715200, // 4.2GB
    mimeType: 'application/x-tar',
    sha256Hash: case2Sha256,
    intakeTimestamp: '2026-10-14T08:10:00.000Z',
    intakeOfficer: vance.name,
    currentCustodian: reed.name,
    storageLocation: 'Forensics Lab Secure Safe #3',
    custodyChain: chain2,
  };

  return {
    officers,
    evidenceList: [evidence1, evidence2],
  };
}
