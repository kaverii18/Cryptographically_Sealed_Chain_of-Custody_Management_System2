/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OfficerIdentity {
  id: string;
  name: string;
  badge: string;
  role: string;
  agency: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  publicKeyHex: string;
  createdAt: string;
}

export interface CustodySignerInfo {
  name: string;
  badge?: string;
  role: string;
  agency: string;
  publicKeyJwk: JsonWebKey;
  publicKeyHex: string;
}

export interface CustodyEntry {
  id: string;
  index: number;
  timestamp: string;
  action: string;
  from: string;
  to: string;
  location: string;
  notes: string;
  evidenceHash: string;
  previousEntryHash: string;
  entryHash: string;
  canonicalPayload: string;
  signatureHex: string;
  signer: CustodySignerInfo;
}

export interface EvidenceRecord {
  id: string;
  caseNumber: string;
  evidenceNumber: string;
  title: string;
  description: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256Hash: string;
  intakeTimestamp: string;
  intakeOfficer: string;
  currentCustodian: string;
  storageLocation: string;
  custodyChain: CustodyEntry[];
}

export interface BlockVerificationStatus {
  index: number;
  id: string;
  action: string;
  computedEntryHash: string;
  storedEntryHash: string;
  hashesMatch: boolean;
  prevHashMatchesPrior: boolean;
  signatureValid: boolean;
  signerName: string;
  errorDetails?: string;
}

export interface ChainVerificationResult {
  isValid: boolean;
  entriesCount: number;
  genesisRootValid: boolean;
  chainContinuityValid: boolean;
  allSignaturesValid: boolean;
  blockResults: BlockVerificationStatus[];
  failureSummary?: string;
  tamperedBlockIndex?: number;
  verifiedAt: string;
}
