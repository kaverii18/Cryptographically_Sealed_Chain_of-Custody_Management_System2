/**
 * Automated Verification Script for Backend Endpoints & Cryptographic Chain
 */
import { generateEcdsaKeyPair, buildCanonicalPayload, computeSha256OfString, signCanonicalData, GENESIS_PREVIOUS_HASH } from '../src/lib/crypto.js';

async function runTests() {
  const BASE_URL = 'http://localhost:3000';
  console.log('--- 1. Testing GET /api/health ---');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const healthData = await healthRes.json();
  console.log('Health Response:', healthData);
  if (healthData.status !== 'ok') throw new Error('Health check failed');

  console.log('\n--- 2. Testing GET /api/officers ---');
  const officersRes = await fetch(`${BASE_URL}/api/officers`);
  const officers = await officersRes.json();
  console.log(`Fetched ${officers.length} registered officers.`);
  const activeOfficer = officers[0];
  console.log(`Active officer: ${activeOfficer.name} (${activeOfficer.badge})`);

  console.log('\n--- 3. Testing POST /api/auth/token ---');
  const authRes = await fetch(`${BASE_URL}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ officerId: activeOfficer.id }),
  });
  const authData = await authRes.json();
  console.log('Auth token acquired successfully:', authData.token.slice(0, 30) + '...');
  const token = authData.token;

  console.log('\n--- 4. Testing Unauthorized Request Handling ---');
  const unauthRes = await fetch(`${BASE_URL}/api/evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  console.log('Unauthorized status code received:', unauthRes.status);
  if (unauthRes.status !== 401) throw new Error(`Expected 401, got ${unauthRes.status}`);

  console.log('\n--- 5. Testing Evidence Registration (POST /api/evidence) ---');
  const testEvidenceId = 'test-ev-' + Date.now();
  const testSha256 = 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef';
  const intakeTime = new Date().toISOString();

  const genesisPayload = buildCanonicalPayload({
    index: 0,
    previousEntryHash: GENESIS_PREVIOUS_HASH,
    evidenceHash: testSha256,
    action: 'Initial Evidence Seizure & Chain Intake',
    from: 'Field Scene (Unit 102)',
    to: activeOfficer.name,
    timestamp: intakeTime,
    location: 'Central Vault Safe 1',
    notes: 'Secured in tamper bag #TB-991',
    signerPublicKeyHex: activeOfficer.publicKeyHex,
  });

  const genesisHash = await computeSha256OfString(genesisPayload);
  const genesisSig = await signCanonicalData(genesisPayload, activeOfficer.privateKeyJwk);

  const newEvidenceRecord = {
    id: testEvidenceId,
    caseNumber: 'CR-TEST-999',
    evidenceNumber: 'EV-TEST-' + Math.floor(Math.random() * 10000),
    title: 'Automated Test Evidence NVMe',
    description: 'Automated test suite verification record',
    fileName: 'test_evidence.bin',
    fileSize: 1048576,
    mimeType: 'application/octet-stream',
    sha256Hash: testSha256,
    intakeTimestamp: intakeTime,
    intakeOfficer: activeOfficer.name,
    currentCustodian: activeOfficer.name,
    storageLocation: 'Central Vault Safe 1',
    custodyChain: [
      {
        id: 'block-0-' + Date.now(),
        index: 0,
        timestamp: intakeTime,
        action: 'Initial Evidence Seizure & Chain Intake',
        from: 'Field Scene (Unit 102)',
        to: activeOfficer.name,
        location: 'Central Vault Safe 1',
        notes: 'Secured in tamper bag #TB-991',
        evidenceHash: testSha256,
        previousEntryHash: GENESIS_PREVIOUS_HASH,
        entryHash: genesisHash,
        canonicalPayload: genesisPayload,
        signatureHex: genesisSig,
        signer: {
          name: activeOfficer.name,
          badge: activeOfficer.badge,
          role: activeOfficer.role,
          agency: activeOfficer.agency,
          publicKeyJwk: activeOfficer.publicKeyJwk,
          publicKeyHex: activeOfficer.publicKeyHex,
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
    body: JSON.stringify(newEvidenceRecord),
  });
  const createdRecord = await createRes.json();
  console.log('Created Evidence:', createdRecord.id, createdRecord.evidenceNumber);
  if (createdRecord.id !== testEvidenceId) throw new Error('Evidence creation failed');

  console.log('\n--- 6. Testing Custody Transfer (POST /api/evidence/:id/custody) ---');
  const transferTime = new Date().toISOString();
  const nextOfficer = officers[1] || officers[0];

  const transferPayload = buildCanonicalPayload({
    index: 1,
    previousEntryHash: genesisHash,
    evidenceHash: testSha256,
    action: 'Physical Transfer to Forensics Lab',
    from: activeOfficer.name,
    to: nextOfficer.name,
    timestamp: transferTime,
    location: 'Forensic Lab Cleanroom 1',
    notes: 'Transfer verified intact under seal #TB-991',
    signerPublicKeyHex: activeOfficer.publicKeyHex,
  });

  const transferHash = await computeSha256OfString(transferPayload);
  const transferSig = await signCanonicalData(transferPayload, activeOfficer.privateKeyJwk);

  const transferBlock = {
    id: 'block-1-' + Date.now(),
    index: 1,
    timestamp: transferTime,
    action: 'Physical Transfer to Forensics Lab',
    from: activeOfficer.name,
    to: nextOfficer.name,
    location: 'Forensic Lab Cleanroom 1',
    notes: 'Transfer verified intact under seal #TB-991',
    evidenceHash: testSha256,
    previousEntryHash: genesisHash,
    entryHash: transferHash,
    canonicalPayload: transferPayload,
    signatureHex: transferSig,
    signer: {
      name: activeOfficer.name,
      badge: activeOfficer.badge,
      role: activeOfficer.role,
      agency: activeOfficer.agency,
      publicKeyJwk: activeOfficer.publicKeyJwk,
      publicKeyHex: activeOfficer.publicKeyHex,
    },
  };

  const appendRes = await fetch(`${BASE_URL}/api/evidence/${testEvidenceId}/custody`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(transferBlock),
  });
  const updatedEvidence = await appendRes.json();
  console.log(`Updated Evidence Chain Length: ${updatedEvidence.custodyChain.length} blocks.`);
  if (updatedEvidence.custodyChain.length !== 2) throw new Error('Custody transfer append failed');

  console.log('\n--- 7. Testing Server-Side Chain Verification (POST /api/verify/chain) ---');
  const verifyRes = await fetch(`${BASE_URL}/api/verify/chain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evidenceId: testEvidenceId }),
  });
  const verifyData = await verifyRes.json();
  console.log('Verification Audit Result:');
  console.log(' - Chain Valid:', verifyData.isValid);
  console.log(' - Genesis Root Valid:', verifyData.genesisRootValid);
  console.log(' - Chain Continuity Valid:', verifyData.chainContinuityValid);
  console.log(' - All Signatures Valid:', verifyData.allSignaturesValid);
  if (!verifyData.isValid) throw new Error('Chain verification returned invalid status for sound chain');

  console.log('\n--- 8. Testing Clean Up (DELETE /api/evidence/:id) ---');
  const deleteRes = await fetch(`${BASE_URL}/api/evidence/${testEvidenceId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const deleteData = await deleteRes.json();
  console.log('Delete Response:', deleteData);

  console.log('\n>>> ALL BACKEND AND CRYPTOGRAPHIC TESTS PASSED SUCCESSFULLY! <<<');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
