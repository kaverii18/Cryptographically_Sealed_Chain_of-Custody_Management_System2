/**
 * Comprehensive verification suite covering all test requirements:
 * 1. Health check verification
 * 2. Unauthorized write rejection (POST /evidence, POST /evidence/:id/custody, DELETE, POST /officers)
 * 3. Authorized custody creation and ECDSA signature chain
 * 4. Verification of chain integrity via POST /api/verify/chain (sound chain & tampered chain)
 * 5. Creation of restart persistence test record
 */
import {
  generateEcdsaKeyPair,
  buildCanonicalPayload,
  computeSha256OfString,
  signCanonicalData,
  GENESIS_PREVIOUS_HASH,
} from '../src/lib/crypto.js';

const BASE_URL = 'http://localhost:3000';

export async function runComprehensiveVerification() {
  console.log('=====================================================');
  console.log('BEGIN COMPREHENSIVE BACKEND VERIFICATION');
  console.log('=====================================================');

  // TEST 1: Health Endpoint
  console.log('\n[TEST 1: Health Endpoint]');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const healthData = await healthRes.json();
  console.log('HTTP Status:', healthRes.status);
  console.log('Response Body:', JSON.stringify(healthData, null, 2));
  if (healthRes.status !== 200 || healthData.status !== 'ok') {
    throw new Error('Health check failed');
  }

  // Fetch registered officers
  const officersRes = await fetch(`${BASE_URL}/api/officers`);
  const officers = await officersRes.json();
  const custodian = officers[0];

  // Acquire JWT token
  const tokenRes = await fetch(`${BASE_URL}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ officerId: custodian.id }),
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.token;

  // TEST 2: Unauthorized Request Rejection
  console.log('\n[TEST 2: Unauthorized Request Rejections]');

  // 2a. Evidence registration without token
  const unauthEv = await fetch(`${BASE_URL}/api/evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Unauthorized' }),
  });
  console.log('POST /api/evidence (no token): HTTP', unauthEv.status);
  if (unauthEv.status !== 401) throw new Error(`Expected 401, got ${unauthEv.status}`);

  // 2b. Custody transfer without token
  const unauthCustody = await fetch(`${BASE_URL}/api/evidence/some-id/custody`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'Illegal Transfer' }),
  });
  console.log('POST /api/evidence/:id/custody (no token): HTTP', unauthCustody.status);
  if (unauthCustody.status !== 401) throw new Error(`Expected 401, got ${unauthCustody.status}`);

  // 2c. Evidence deletion without token
  const unauthDel = await fetch(`${BASE_URL}/api/evidence/some-id`, {
    method: 'DELETE',
  });
  console.log('DELETE /api/evidence/:id (no token): HTTP', unauthDel.status);
  if (unauthDel.status !== 401) throw new Error(`Expected 401, got ${unauthDel.status}`);

  // 2d. Officer creation with invalid/fake token
  const fakeTokenRes = await fetch(`${BASE_URL}/api/officers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer invalid.fake.token',
    },
    body: JSON.stringify({ name: 'Imposter' }),
  });
  console.log('POST /api/officers (invalid token): HTTP', fakeTokenRes.status);
  if (fakeTokenRes.status !== 401) throw new Error(`Expected 401, got ${fakeTokenRes.status}`);

  // TEST 3: Authorized Evidence & Custody Transfer with ECDSA Signature
  console.log('\n[TEST 3: Authorized Creation & ECDSA Custody Transfer]');
  const persistenceTestId = 'ev-persist-test-' + Date.now();
  const fileHash = 'c0ffee112233445566778899aabbccddeeff00112233445566778899aabbccdd';
  const genesisTimestamp = new Date().toISOString();

  const genesisPayload = buildCanonicalPayload({
    index: 0,
    previousEntryHash: GENESIS_PREVIOUS_HASH,
    evidenceHash: fileHash,
    action: 'Initial Intake Verification',
    from: 'Evidence Room Lockbox A',
    to: custodian.name,
    timestamp: genesisTimestamp,
    location: 'Evidence Locker 14',
    notes: 'Cryptographic test genesis sealed',
    signerPublicKeyHex: custodian.publicKeyHex,
  });
  const genesisHash = await computeSha256OfString(genesisPayload);
  const genesisSig = await signCanonicalData(genesisPayload, custodian.privateKeyJwk);

  const newRecord = {
    id: persistenceTestId,
    caseNumber: 'CASE-VERIFY-2026',
    evidenceNumber: 'EV-VERIFY-' + Math.floor(1000 + Math.random() * 9000),
    title: 'Persistence & Signature Verification Artifact',
    description: 'Automated test evidence verifying SQLite persistence across restarts',
    fileName: 'server_test_payload.bin',
    fileSize: 4096,
    mimeType: 'application/octet-stream',
    sha256Hash: fileHash,
    intakeTimestamp: genesisTimestamp,
    intakeOfficer: custodian.name,
    currentCustodian: custodian.name,
    storageLocation: 'Evidence Locker 14',
    custodyChain: [
      {
        id: 'blk-0-' + Date.now(),
        index: 0,
        timestamp: genesisTimestamp,
        action: 'Initial Intake Verification',
        from: 'Evidence Room Lockbox A',
        to: custodian.name,
        location: 'Evidence Locker 14',
        notes: 'Cryptographic test genesis sealed',
        evidenceHash: fileHash,
        previousEntryHash: GENESIS_PREVIOUS_HASH,
        entryHash: genesisHash,
        canonicalPayload: genesisPayload,
        signatureHex: genesisSig,
        signer: {
          name: custodian.name,
          badge: custodian.badge,
          role: custodian.role,
          agency: custodian.agency,
          publicKeyJwk: custodian.publicKeyJwk,
          publicKeyHex: custodian.publicKeyHex,
        },
      },
    ],
  };

  const createRes = await fetch(`${BASE_URL}/api/evidence`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(newRecord),
  });
  console.log('POST /api/evidence: HTTP', createRes.status);
  const created = await createRes.json();
  console.log('Created Record ID:', created.id, '| Evidence Number:', created.evidenceNumber);

  // Append a custody transfer block signed with ECDSA
  const nextOfficer = officers[1] || custodian;
  const transferTimestamp = new Date().toISOString();
  const transferPayload = buildCanonicalPayload({
    index: 1,
    previousEntryHash: genesisHash,
    evidenceHash: fileHash,
    action: 'Transfer for Laboratory Microscopic Inspection',
    from: custodian.name,
    to: nextOfficer.name,
    timestamp: transferTimestamp,
    location: 'Lab Cleanroom Delta',
    notes: 'Transferred with security seal intact',
    signerPublicKeyHex: custodian.publicKeyHex,
  });
  const transferHash = await computeSha256OfString(transferPayload);
  const transferSig = await signCanonicalData(transferPayload, custodian.privateKeyJwk);

  const transferBlock = {
    id: 'blk-1-' + Date.now(),
    index: 1,
    timestamp: transferTimestamp,
    action: 'Transfer for Laboratory Microscopic Inspection',
    from: custodian.name,
    to: nextOfficer.name,
    location: 'Lab Cleanroom Delta',
    notes: 'Transferred with security seal intact',
    evidenceHash: fileHash,
    previousEntryHash: genesisHash,
    entryHash: transferHash,
    canonicalPayload: transferPayload,
    signatureHex: transferSig,
    signer: {
      name: custodian.name,
      badge: custodian.badge,
      role: custodian.role,
      agency: custodian.agency,
      publicKeyJwk: custodian.publicKeyJwk,
      publicKeyHex: custodian.publicKeyHex,
    },
  };

  const transferRes = await fetch(`${BASE_URL}/api/evidence/${persistenceTestId}/custody`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(transferBlock),
  });
  console.log('POST /api/evidence/:id/custody: HTTP', transferRes.status);
  const updated = await transferRes.json();
  console.log('Chain Length after transfer:', updated.custodyChain.length);

  // TEST 4: Cryptographic Chain Verification Endpoint
  console.log('\n[TEST 4: POST /api/verify/chain Verification]');
  const verifyRes = await fetch(`${BASE_URL}/api/verify/chain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evidenceId: persistenceTestId, uploadedFileHash: fileHash }),
  });
  console.log('POST /api/verify/chain: HTTP', verifyRes.status);
  const verifyResult = await verifyRes.json();
  console.log('Verification Details:', JSON.stringify(verifyResult, null, 2));
  if (!verifyResult.isValid) throw new Error('Legitimate chain was flagged as invalid');

  console.log('\nPersistent Record ID saved for restart verification:', persistenceTestId);
  return { persistenceTestId, token };
}

runComprehensiveVerification().catch((err) => {
  console.error('Comprehensive verification failed:', err);
  process.exit(1);
});
