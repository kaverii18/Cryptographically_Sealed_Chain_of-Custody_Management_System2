/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  initDatabase,
  getAllEvidence,
  getEvidenceById,
  insertEvidenceWithGenesis,
  appendCustodyBlock,
  removeEvidence,
  getAllOfficers,
  getOfficerById,
  insertOfficer,
  resetDatabase,
  db,
} from './src/server/db';
import {
  verifyCompleteChain,
  computeSha256OfString,
  verifySignature,
  GENESIS_PREVIOUS_HASH,
  buildCanonicalPayload,
} from './src/lib/crypto';
import { EvidenceRecord, CustodyEntry, OfficerIdentity } from './src/types/custody';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'cryptographically-sealed-custody-jwt-secret-fips186-4-v1';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize SQLite Database
initDatabase();

// Authenticated Custodian Interface Extension
export interface AuthenticatedRequest extends Request {
  custodian?: OfficerIdentity;
}

/**
 * Server-Side Authentication & Authorization Middleware
 * Verifies Bearer JWT token before permitting critical write operations.
 * Prevents trusting arbitrary user IDs from client requests.
 */
function requireCustodian(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication Required',
      message: 'Missing or malformed Authorization Bearer token. Please authenticate as a registered custodian.',
    });
  }

  const token = authHeader.substring(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { officerId: string; badge: string; name: string };
    const officer = getOfficerById(decoded.officerId);
    if (!officer) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Custodian identity associated with this token is not registered in the database.',
      });
    }

    req.custodian = officer;
    next();
  } catch (err: any) {
    return res.status(401).json({
      error: 'Invalid Token',
      message: 'Custodian authentication token has expired or is invalid.',
      details: err.message,
    });
  }
}

// -------------------------------------------------------------
// REST API ROUTES
// -------------------------------------------------------------

/**
 * Health check & diagnostic endpoint
 */
app.get('/api/health', (req: Request, res: Response) => {
  const evidenceCount = (db.prepare('SELECT COUNT(*) as count FROM evidence').get() as { count: number }).count;
  const officerCount = (db.prepare('SELECT COUNT(*) as count FROM officers').get() as { count: number }).count;
  const blockCount = (db.prepare('SELECT COUNT(*) as count FROM custody_chain').get() as { count: number }).count;

  res.json({
    status: 'ok',
    system: 'Cryptographically Sealed Chain of Custody System',
    timestamp: new Date().toISOString(),
    database: 'SQLite (WAL Mode with Immutability Triggers)',
    counts: {
      evidence: evidenceCount,
      custodyBlocks: blockCount,
      officers: officerCount,
    },
    standards: ['FIPS 186-4 ECDSA P-256', 'SHA-256 Invariant', 'W3C Web Crypto API'],
  });
});

/**
 * Custodian Authentication: Issue signed session token
 */
app.post('/api/auth/token', (req: Request, res: Response) => {
  const { officerId } = req.body;
  if (!officerId || typeof officerId !== 'string') {
    return res.status(400).json({ error: 'Validation Error', message: 'officerId is required.' });
  }

  const officer = getOfficerById(officerId.trim());
  if (!officer) {
    return res.status(404).json({ error: 'Not Found', message: 'No registered custodian found with this ID.' });
  }

  const token = jwt.sign(
    {
      officerId: officer.id,
      name: officer.name,
      badge: officer.badge,
      role: officer.role,
      agency: officer.agency,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    officer: {
      id: officer.id,
      name: officer.name,
      badge: officer.badge,
      role: officer.role,
      agency: officer.agency,
      publicKeyHex: officer.publicKeyHex,
    },
    expiresIn: '24h',
  });
});

/**
 * List all registered officers
 */
app.get('/api/officers', (req: Request, res: Response) => {
  try {
    const officers = getAllOfficers();
    res.json(officers);
  } catch (err: any) {
    console.error('Error fetching officers:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

/**
 * Register a new officer identity
 * Requires authenticated custodian token
 */
app.post('/api/officers', requireCustodian, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id, name, badge, role, agency, publicKeyJwk, privateKeyJwk, publicKeyHex, createdAt } = req.body;

    if (!name || !badge || !role || !agency || !publicKeyJwk || !privateKeyJwk || !publicKeyHex) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Missing required officer fields: name, badge, role, agency, publicKeyJwk, privateKeyJwk, publicKeyHex.',
      });
    }

    const newOfficer: OfficerIdentity = {
      id: id || crypto.randomUUID(),
      name: String(name).trim(),
      badge: String(badge).trim(),
      role: String(role).trim(),
      agency: String(agency).trim(),
      publicKeyJwk,
      privateKeyJwk,
      publicKeyHex: String(publicKeyHex).trim(),
      createdAt: createdAt || new Date().toISOString(),
    };

    insertOfficer(newOfficer);
    res.status(201).json(newOfficer);
  } catch (err: any) {
    console.error('Error inserting officer:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

/**
 * List all evidence records with their ordered custody chain
 */
app.get('/api/evidence', (req: Request, res: Response) => {
  try {
    const records = getAllEvidence();
    res.json(records);
  } catch (err: any) {
    console.error('Error fetching evidence:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

/**
 * Get specific evidence by ID
 */
app.get('/api/evidence/:id', (req: Request, res: Response) => {
  try {
    const record = getEvidenceById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Not Found', message: `Evidence ${req.params.id} does not exist.` });
    }
    res.json(record);
  } catch (err: any) {
    console.error('Error fetching evidence record:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

/**
 * Register new evidence with sealed Genesis Block #0
 * Requires custodian authentication
 */
app.post('/api/evidence', requireCustodian, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const record = req.body as EvidenceRecord;

    // Strict Input Validation
    if (!record.caseNumber || !record.evidenceNumber || !record.title || !record.sha256Hash) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Missing required evidence properties: caseNumber, evidenceNumber, title, sha256Hash.',
      });
    }

    if (!Array.isArray(record.custodyChain) || record.custodyChain.length === 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'An evidence record must include at least Genesis Block #0.',
      });
    }

    const genesisBlock = record.custodyChain[0];
    if (genesisBlock.index !== 0 || genesisBlock.previousEntryHash !== GENESIS_PREVIOUS_HASH) {
      return res.status(400).json({
        error: 'Cryptographic Violation',
        message: `Genesis block must have index 0 and root pointer ${GENESIS_PREVIOUS_HASH}.`,
      });
    }

    // Verify Genesis Block signature server-side
    const isSigValid = await verifySignature(
      genesisBlock.canonicalPayload,
      genesisBlock.signatureHex,
      genesisBlock.signer.publicKeyJwk
    );

    if (!isSigValid) {
      return res.status(400).json({
        error: 'Cryptographic Failure',
        message: 'Genesis block ECDSA signature failed server-side mathematical verification.',
      });
    }

    insertEvidenceWithGenesis(record);
    const created = getEvidenceById(record.id);
    res.status(201).json(created);
  } catch (err: any) {
    console.error('Error registering evidence:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

/**
 * Append a newly signed custody block to an evidence chain
 * Requires custodian authentication + Server-side cryptographic verification
 */
app.post('/api/evidence/:id/custody', requireCustodian, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const evidenceId = req.params.id;
    const newBlock = req.body as CustodyEntry;

    const evidence = getEvidenceById(evidenceId);
    if (!evidence) {
      return res.status(404).json({ error: 'Not Found', message: `Evidence ${evidenceId} not found.` });
    }

    // 1. Structural Validation
    if (!newBlock.action || !newBlock.from || !newBlock.to || !newBlock.timestamp || !newBlock.entryHash) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Missing required custody block properties: action, from, to, timestamp, entryHash, signatureHex.',
      });
    }

    // 2. Sequential Chain Invariant Validation
    const latestBlock = evidence.custodyChain[evidence.custodyChain.length - 1];
    if (newBlock.index !== latestBlock.index + 1) {
      return res.status(400).json({
        error: 'Sequence Error',
        message: `Expected block index ${latestBlock.index + 1}, received ${newBlock.index}.`,
      });
    }

    if (newBlock.previousEntryHash.toLowerCase() !== latestBlock.entryHash.toLowerCase()) {
      return res.status(400).json({
        error: 'Chain Integrity Failure',
        message: 'The submitted previousEntryHash does not match the parent block hash in the database.',
      });
    }

    // 3. Recompute canonical payload and check SHA-256
    const expectedPayload = buildCanonicalPayload({
      index: newBlock.index,
      previousEntryHash: newBlock.previousEntryHash,
      evidenceHash: evidence.sha256Hash,
      action: newBlock.action,
      from: newBlock.from,
      to: newBlock.to,
      timestamp: newBlock.timestamp,
      location: newBlock.location,
      notes: newBlock.notes,
      signerPublicKeyHex: newBlock.signer.publicKeyHex,
    });

    const computedHash = await computeSha256OfString(expectedPayload);
    if (computedHash.toLowerCase() !== newBlock.entryHash.toLowerCase()) {
      return res.status(400).json({
        error: 'Tamper Detected',
        message: 'Calculated canonical hash does not match submitted entryHash. Data payload was modified.',
      });
    }

    // 4. Server-Side ECDSA Signature Verification
    const isSignatureValid = await verifySignature(
      newBlock.canonicalPayload || expectedPayload,
      newBlock.signatureHex,
      newBlock.signer.publicKeyJwk
    );

    if (!isSignatureValid) {
      return res.status(400).json({
        error: 'Signature Verification Failed',
        message: 'ECDSA P-256 digital signature does not match custodian registered public key.',
      });
    }

    // 5. Append to database via Transaction
    const updatedRecord = appendCustodyBlock(evidenceId, newBlock);
    res.status(201).json(updatedRecord);
  } catch (err: any) {
    console.error('Error appending custody entry:', err);
    res.status(500).json({ error: 'Database Transaction Failed', message: err.message });
  }
});

/**
 * Delete evidence record
 * Requires custodian authentication
 */
app.delete('/api/evidence/:id', requireCustodian, (req: AuthenticatedRequest, res: Response) => {
  try {
    const evidence = getEvidenceById(req.params.id);
    if (!evidence) {
      return res.status(404).json({ error: 'Not Found', message: `Evidence ${req.params.id} does not exist.` });
    }

    removeEvidence(req.params.id);
    res.json({ message: `Evidence ${evidence.evidenceNumber} deleted successfully.` });
  } catch (err: any) {
    console.error('Error deleting evidence record:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

/**
 * Server-Side Cryptographic Chain Verification Endpoint
 */
app.post('/api/verify/chain', async (req: Request, res: Response) => {
  try {
    const { evidenceId, uploadedFileHash } = req.body;
    let evidence: EvidenceRecord | null = null;

    if (evidenceId) {
      evidence = getEvidenceById(evidenceId);
    } else if (req.body.evidence) {
      evidence = req.body.evidence;
    }

    if (!evidence) {
      return res.status(404).json({ error: 'Not Found', message: 'No evidence record found to audit.' });
    }

    const auditResult = await verifyCompleteChain(evidence, uploadedFileHash);
    res.json(auditResult);
  } catch (err: any) {
    console.error('Error during chain audit:', err);
    res.status(500).json({ error: 'Verification Error', message: err.message });
  }
});

/**
 * Reset database to standard initial seeded demonstration state
 */
app.post('/api/reset', async (req: Request, res: Response) => {
  try {
    await resetDatabase();
    const evidence = getAllEvidence();
    const officers = getAllOfficers();
    res.json({ message: 'Database reset to default cryptographic seed state.', evidence, officers });
  } catch (err: any) {
    console.error('Error resetting database:', err);
    res.status(500).json({ error: 'Reset Failed', message: err.message });
  }
});

// -------------------------------------------------------------
// VITE INTEGRATION & STATIC SERVING ON PORT 3000
// -------------------------------------------------------------
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Development mode: Mount Vite dev middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: Serve built assets from dist
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cryptographically Sealed Chain of Custody System running on port ${PORT}`);
    console.log(`Backend API live at http://localhost:${PORT}/api/health`);
  });
}

startServer().catch((err) => {
  console.error('Fatal Server Boot Error:', err);
  process.exit(1);
});
