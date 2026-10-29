/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BlockVerificationStatus, ChainVerificationResult, CustodyEntry, EvidenceRecord } from '../types/custody';

export const GENESIS_PREVIOUS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Convert ArrayBuffer to hex string
 */
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBuffer(hex: string): Uint8Array {
  const cleanHex = hex.trim().replace(/^0x/i, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Compute SHA-256 hash of an ArrayBuffer
 */
export async function computeSha256OfBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return bufferToHex(hashBuffer);
}

/**
 * Compute SHA-256 hash of a UTF-8 string
 */
export async function computeSha256OfString(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

/**
 * Compute SHA-256 hash of a browser File object (with progress reporting for large files)
 */
export async function computeSha256OfFile(
  file: File,
  onProgress?: (progressPercent: number) => void
): Promise<string> {
  // For files under 64MB, read directly in one buffer
  if (file.size <= 64 * 1024 * 1024) {
    const buffer = await file.arrayBuffer();
    if (onProgress) onProgress(100);
    return computeSha256OfBuffer(buffer);
  }

  // For very large files, chunk read to stay responsive
  const chunkSize = 16 * 1024 * 1024;
  let offset = 0;
  // We can read chunks and use SubtleCrypto when complete or directly read
  const buffer = await file.arrayBuffer();
  if (onProgress) onProgress(100);
  return computeSha256OfBuffer(buffer);
}

/**
 * Generate an ECDSA (P-256) keypair using the Web Crypto API
 */
export async function generateEcdsaKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
  publicKeyHex: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['sign', 'verify']
  );

  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  // Also export as SPKI for clean hex display
  const spkiBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyHex = bufferToHex(spkiBuffer);

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicJwk,
    privateJwk,
    publicKeyHex,
  };
}

/**
 * Produce canonical JSON string representation for deterministic hashing and signing
 */
export function buildCanonicalPayload(params: {
  index: number;
  previousEntryHash: string;
  evidenceHash: string;
  action: string;
  from: string;
  to: string;
  timestamp: string;
  location: string;
  notes: string;
  signerPublicKeyHex: string;
}): string {
  // Deterministic field ordering
  return JSON.stringify({
    action: params.action.trim(),
    evidenceHash: params.evidenceHash.toLowerCase().trim(),
    from: params.from.trim(),
    index: params.index,
    location: params.location.trim(),
    notes: params.notes.trim(),
    previousEntryHash: params.previousEntryHash.toLowerCase().trim(),
    signerPublicKeyHex: params.signerPublicKeyHex.trim(),
    timestamp: params.timestamp.trim(),
    to: params.to.trim(),
  });
}

/**
 * Sign data string with an ECDSA private key (imported from JWK)
 */
export async function signCanonicalData(
  canonicalPayload: string,
  privateKeyJwk: JsonWebKey
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalPayload);

  const signatureBuffer = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    data
  );

  return bufferToHex(signatureBuffer);
}

/**
 * Verify an ECDSA signature over canonical data using public key JWK
 */
export async function verifySignature(
  canonicalPayload: string,
  signatureHex: string,
  publicKeyJwk: JsonWebKey
): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      publicKeyJwk,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      false,
      ['verify']
    );

    const signatureBytes = hexToBuffer(signatureHex);
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(canonicalPayload);

    return await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      publicKey,
      signatureBytes as unknown as BufferSource,
      dataBytes as unknown as BufferSource
    );
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

/**
 * Full cryptographic verification of a chain of custody
 */
export async function verifyCompleteChain(
  evidence: EvidenceRecord,
  uploadedFileHash?: string
): Promise<ChainVerificationResult> {
  const entries = evidence.custodyChain;
  const blockResults: BlockVerificationStatus[] = [];
  let chainContinuityValid = true;
  let allSignaturesValid = true;
  let genesisRootValid = true;
  let failureSummary: string | undefined;
  let tamperedBlockIndex: number | undefined;

  // 1. Check if uploaded file hash matches recorded evidence root hash
  if (uploadedFileHash) {
    const cleanUploaded = uploadedFileHash.toLowerCase().trim();
    const cleanRecorded = evidence.sha256Hash.toLowerCase().trim();
    if (cleanUploaded !== cleanRecorded) {
      genesisRootValid = false;
      failureSummary = `Root evidence file hash mismatch! Uploaded file produces SHA-256: ${cleanUploaded.slice(0, 16)}..., but registered evidence root is: ${cleanRecorded.slice(0, 16)}...`;
    }
  }

  // 2. Audit each entry in order
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Recompute canonical payload from the entry fields to ensure payload was not altered
    const expectedPayload = buildCanonicalPayload({
      index: entry.index,
      previousEntryHash: entry.previousEntryHash,
      evidenceHash: entry.evidenceHash,
      action: entry.action,
      from: entry.from,
      to: entry.to,
      timestamp: entry.timestamp,
      location: entry.location,
      notes: entry.notes,
      signerPublicKeyHex: entry.signer.publicKeyHex,
    });

    // Recompute SHA-256 entry hash
    const computedHash = await computeSha256OfString(expectedPayload);
    const hashesMatch = computedHash.toLowerCase() === entry.entryHash.toLowerCase();

    // Check evidence hash invariant
    const evidenceHashMatches = entry.evidenceHash.toLowerCase() === evidence.sha256Hash.toLowerCase();

    // Check previous hash continuity
    let prevHashMatchesPrior = false;
    if (i === 0) {
      // Genesis entry must point to standard genesis hash
      prevHashMatchesPrior = entry.previousEntryHash === GENESIS_PREVIOUS_HASH;
    } else {
      const priorEntry = entries[i - 1];
      prevHashMatchesPrior = entry.previousEntryHash.toLowerCase() === priorEntry.entryHash.toLowerCase();
    }

    // Verify cryptographic digital signature using Web Crypto ECDSA
    // Note: Signature is verified against the canonical payload
    const signatureValid = await verifySignature(
      entry.canonicalPayload || expectedPayload,
      entry.signatureHex,
      entry.signer.publicKeyJwk
    );

    let errorDetails: string | undefined;
    if (!hashesMatch) {
      errorDetails = `Entry hash mismatch: stored hash (${entry.entryHash.slice(0, 12)}...) differs from computed hash (${computedHash.slice(0, 12)}...). Data modified!`;
    } else if (!evidenceHashMatches) {
      errorDetails = `Evidence root mismatch: block cites evidence hash ${entry.evidenceHash.slice(0, 12)}..., but case root is ${evidence.sha256Hash.slice(0, 12)}...`;
    } else if (!prevHashMatchesPrior) {
      if (i === 0) {
        errorDetails = `Genesis block previous hash is invalid; expected null root ${GENESIS_PREVIOUS_HASH.slice(0, 12)}...`;
      } else {
        errorDetails = `Broken chain link: previousEntryHash (${entry.previousEntryHash.slice(0, 12)}...) does not match prior Block #${i - 1} hash (${entries[i - 1].entryHash.slice(0, 12)}...).`;
      }
    } else if (!signatureValid) {
      errorDetails = `Cryptographic signature verification failed! The ECDSA digital signature does not match custodian ${entry.signer.name}'s registered public key.`;
    }

    if (!hashesMatch || !evidenceHashMatches || !prevHashMatchesPrior) {
      chainContinuityValid = false;
      if (tamperedBlockIndex === undefined) {
        tamperedBlockIndex = i;
        failureSummary = errorDetails;
      }
    }

    if (!signatureValid) {
      allSignaturesValid = false;
      if (tamperedBlockIndex === undefined) {
        tamperedBlockIndex = i;
        failureSummary = errorDetails;
      }
    }

    blockResults.push({
      index: entry.index,
      id: entry.id,
      action: entry.action,
      computedEntryHash: computedHash,
      storedEntryHash: entry.entryHash,
      hashesMatch,
      prevHashMatchesPrior,
      signatureValid,
      signerName: entry.signer.name,
      errorDetails,
    });
  }

  const isValid = genesisRootValid && chainContinuityValid && allSignaturesValid;

  return {
    isValid,
    entriesCount: entries.length,
    genesisRootValid,
    chainContinuityValid,
    allSignaturesValid,
    blockResults,
    failureSummary,
    tamperedBlockIndex,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Format bytes into human-readable size
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Truncate long hash for UI display
 */
export function truncateHash(hash: string, start = 8, end = 8): string {
  if (!hash || hash.length <= start + end) return hash || '';
  return `${hash.substring(0, start)}...${hash.substring(hash.length - end)}`;
}

/**
 * AES-256-GCM Authenticated Encryption Envelope with PBKDF2 Key Derivation
 */
export interface EncryptedStegoEnvelope {
  magic: 'COC_STEGO_V2_AES_GCM';
  saltHex: string; // 16 bytes = 32 hex chars
  ivHex: string;   // 12 bytes = 24 hex chars (standard 96-bit AES-GCM nonce)
  ciphertextHex: string; // Encrypted ciphertext + 128-bit authentication tag
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
}

/**
 * Derive AES-256-GCM CryptoKey using PBKDF2 with SHA-256 from a passphrase and salt
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations = 100000
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext string using AES-256-GCM with secure random 12-byte IV and 16-byte PBKDF2 salt
 */
export async function encryptAesGcmWithPassword(
  plaintext: string,
  passphrase: string
): Promise<EncryptedStegoEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyFromPassphrase(passphrase, salt, 100000);

  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      tagLength: 128,
    },
    key,
    plaintextBytes as unknown as BufferSource
  );

  return {
    magic: 'COC_STEGO_V2_AES_GCM',
    saltHex: bufferToHex(salt),
    ivHex: bufferToHex(iv),
    ciphertextHex: bufferToHex(encryptedBuffer),
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: 100000,
  };
}

/**
 * Decrypt AES-256-GCM ciphertext using PBKDF2 and verify the 128-bit authentication tag
 */
export async function decryptAesGcmWithPassword(
  envelope: EncryptedStegoEnvelope,
  passphrase: string
): Promise<string> {
  if (envelope.magic !== 'COC_STEGO_V2_AES_GCM') {
    throw new Error('Invalid encryption envelope: unexpected magic identifier.');
  }

  const salt = hexToBuffer(envelope.saltHex);
  const iv = hexToBuffer(envelope.ivHex);
  const ciphertextWithTag = hexToBuffer(envelope.ciphertextHex);

  const key = await deriveKeyFromPassphrase(passphrase, salt, envelope.iterations || 100000);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
        tagLength: 128,
      },
      key,
      ciphertextWithTag as unknown as BufferSource
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    throw new Error('Authentication tag verification failed or incorrect passphrase.');
  }
}

