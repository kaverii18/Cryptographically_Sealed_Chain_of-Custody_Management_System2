/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { EvidenceRecord, CustodyEntry, OfficerIdentity } from '../types/custody';
import { generateInitialIdentitiesAndEvidence } from '../lib/sampleData';

// Ensure data directory exists
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'custody.db');
export const db = new Database(DB_PATH);

// Enable WAL mode for performance and concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Initialize SQLite database tables, indexes, and immutability triggers
 */
export function initDatabase() {
  db.exec(`
    -- Registered Officers / Custodians Table
    CREATE TABLE IF NOT EXISTS officers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      badge TEXT NOT NULL,
      role TEXT NOT NULL,
      agency TEXT NOT NULL,
      public_key_jwk TEXT NOT NULL,
      private_key_jwk TEXT NOT NULL,
      public_key_hex TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Evidence Records Table
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      case_number TEXT NOT NULL,
      evidence_number TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      sha256_hash TEXT NOT NULL,
      intake_timestamp TEXT NOT NULL,
      intake_officer TEXT NOT NULL,
      current_custodian TEXT NOT NULL,
      storage_location TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Cryptographically Sealed Custody Chain Table
    CREATE TABLE IF NOT EXISTS custody_chain (
      id TEXT PRIMARY KEY,
      evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
      block_index INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      from_party TEXT NOT NULL,
      to_party TEXT NOT NULL,
      location TEXT NOT NULL,
      notes TEXT NOT NULL,
      evidence_hash TEXT NOT NULL,
      previous_entry_hash TEXT NOT NULL,
      entry_hash TEXT NOT NULL UNIQUE,
      canonical_payload TEXT NOT NULL,
      signature_hex TEXT NOT NULL,
      signer_name TEXT NOT NULL,
      signer_badge TEXT,
      signer_role TEXT NOT NULL,
      signer_agency TEXT NOT NULL,
      signer_public_key_jwk TEXT NOT NULL,
      signer_public_key_hex TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(evidence_id, block_index)
    );

    -- Indexing for fast cryptographic lookups
    CREATE INDEX IF NOT EXISTS idx_custody_evidence ON custody_chain(evidence_id, block_index ASC);
    CREATE INDEX IF NOT EXISTS idx_custody_entry_hash ON custody_chain(entry_hash);
    CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_number);
    CREATE INDEX IF NOT EXISTS idx_evidence_number ON evidence(evidence_number);

    -- Immutability Security Trigger: Prevent updating existing custody blocks
    CREATE TRIGGER IF NOT EXISTS prevent_custody_block_update
    BEFORE UPDATE ON custody_chain
    BEGIN
      SELECT RAISE(FAIL, 'Security Violation: Cryptographically sealed chain-of-custody blocks cannot be modified');
    END;
  `);

  // Seed default demonstration records if tables are empty
  seedIfEmpty();
}

/**
 * Seed initial data if database is fresh
 */
async function seedIfEmpty() {
  const officerCountRow = db.prepare('SELECT COUNT(*) as count FROM officers').get() as { count: number };
  const evidenceCountRow = db.prepare('SELECT COUNT(*) as count FROM evidence').get() as { count: number };

  if (officerCountRow.count === 0 && evidenceCountRow.count === 0) {
    try {
      const initial = await generateInitialIdentitiesAndEvidence();

      const insertOfficer = db.prepare(`
        INSERT INTO officers (id, name, badge, role, agency, public_key_jwk, private_key_jwk, public_key_hex, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertEvidence = db.prepare(`
        INSERT INTO evidence (id, case_number, evidence_number, title, description, file_name, file_size, mime_type, sha256_hash, intake_timestamp, intake_officer, current_custodian, storage_location, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertBlock = db.prepare(`
        INSERT INTO custody_chain (id, evidence_id, block_index, timestamp, action, from_party, to_party, location, notes, evidence_hash, previous_entry_hash, entry_hash, canonical_payload, signature_hex, signer_name, signer_badge, signer_role, signer_agency, signer_public_key_jwk, signer_public_key_hex, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const seedTx = db.transaction(() => {
        for (const off of initial.officers) {
          insertOfficer.run(
            off.id,
            off.name,
            off.badge,
            off.role,
            off.agency,
            JSON.stringify(off.publicKeyJwk),
            JSON.stringify(off.privateKeyJwk),
            off.publicKeyHex,
            off.createdAt
          );
        }

        for (const ev of initial.evidenceList) {
          insertEvidence.run(
            ev.id,
            ev.caseNumber,
            ev.evidenceNumber,
            ev.title,
            ev.description,
            ev.fileName,
            ev.fileSize,
            ev.mimeType,
            ev.sha256Hash,
            ev.intakeTimestamp,
            ev.intakeOfficer,
            ev.currentCustodian,
            ev.storageLocation,
            new Date().toISOString()
          );

          for (const block of ev.custodyChain) {
            insertBlock.run(
              block.id,
              ev.id,
              block.index,
              block.timestamp,
              block.action,
              block.from,
              block.to,
              block.location,
              block.notes,
              block.evidenceHash,
              block.previousEntryHash,
              block.entryHash,
              block.canonicalPayload,
              block.signatureHex,
              block.signer.name,
              block.signer.badge || null,
              block.signer.role,
              block.signer.agency,
              JSON.stringify(block.signer.publicKeyJwk),
              block.signer.publicKeyHex,
              new Date().toISOString()
            );
          }
        }
      });

      seedTx();
      console.log('Database initialized and seeded with initial cryptographic records.');
    } catch (err) {
      console.error('Failed to seed initial database records:', err);
    }
  }
}

/**
 * Fetch all officers
 */
export function getAllOfficers(): OfficerIdentity[] {
  const rows = db.prepare('SELECT * FROM officers ORDER BY created_at ASC').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    badge: r.badge,
    role: r.role,
    agency: r.agency,
    publicKeyJwk: JSON.parse(r.public_key_jwk),
    privateKeyJwk: JSON.parse(r.private_key_jwk),
    publicKeyHex: r.public_key_hex,
    createdAt: r.created_at,
  }));
}

/**
 * Get officer by ID
 */
export function getOfficerById(id: string): OfficerIdentity | null {
  const r = db.prepare('SELECT * FROM officers WHERE id = ?').get(id) as any;
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    badge: r.badge,
    role: r.role,
    agency: r.agency,
    publicKeyJwk: JSON.parse(r.public_key_jwk),
    privateKeyJwk: JSON.parse(r.private_key_jwk),
    publicKeyHex: r.public_key_hex,
    createdAt: r.created_at,
  };
}

/**
 * Save new officer
 */
export function insertOfficer(officer: OfficerIdentity): void {
  const stmt = db.prepare(`
    INSERT INTO officers (id, name, badge, role, agency, public_key_jwk, private_key_jwk, public_key_hex, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    officer.id,
    officer.name,
    officer.badge,
    officer.role,
    officer.agency,
    JSON.stringify(officer.publicKeyJwk),
    JSON.stringify(officer.privateKeyJwk),
    officer.publicKeyHex,
    officer.createdAt || new Date().toISOString()
  );
}

/**
 * Fetch all evidence records along with their ordered custody chain blocks
 */
export function getAllEvidence(): EvidenceRecord[] {
  const evidenceRows = db.prepare('SELECT * FROM evidence ORDER BY intake_timestamp DESC').all() as any[];
  const blockStmt = db.prepare('SELECT * FROM custody_chain WHERE evidence_id = ? ORDER BY block_index ASC');

  return evidenceRows.map((ev) => {
    const blockRows = blockStmt.all(ev.id) as any[];
    const custodyChain: CustodyEntry[] = blockRows.map((b) => ({
      id: b.id,
      index: b.block_index,
      timestamp: b.timestamp,
      action: b.action,
      from: b.from_party,
      to: b.to_party,
      location: b.location,
      notes: b.notes,
      evidenceHash: b.evidence_hash,
      previousEntryHash: b.previous_entry_hash,
      entryHash: b.entry_hash,
      canonicalPayload: b.canonical_payload,
      signatureHex: b.signature_hex,
      signer: {
        name: b.signer_name,
        badge: b.signer_badge,
        role: b.signer_role,
        agency: b.signer_agency,
        publicKeyJwk: JSON.parse(b.signer_public_key_jwk),
        publicKeyHex: b.signer_public_key_hex,
      },
    }));

    return {
      id: ev.id,
      caseNumber: ev.case_number,
      evidenceNumber: ev.evidence_number,
      title: ev.title,
      description: ev.description,
      fileName: ev.file_name,
      fileSize: ev.file_size,
      mimeType: ev.mime_type,
      sha256Hash: ev.sha256_hash,
      intakeTimestamp: ev.intake_timestamp,
      intakeOfficer: ev.intake_officer,
      currentCustodian: ev.current_custodian,
      storageLocation: ev.storage_location,
      custodyChain,
    };
  });
}

/**
 * Fetch a single evidence record by ID
 */
export function getEvidenceById(id: string): EvidenceRecord | null {
  const ev = db.prepare('SELECT * FROM evidence WHERE id = ?').get(id) as any;
  if (!ev) return null;

  const blockRows = db.prepare('SELECT * FROM custody_chain WHERE evidence_id = ? ORDER BY block_index ASC').all(id) as any[];
  const custodyChain: CustodyEntry[] = blockRows.map((b) => ({
    id: b.id,
    index: b.block_index,
    timestamp: b.timestamp,
    action: b.action,
    from: b.from_party,
    to: b.to_party,
    location: b.location,
    notes: b.notes,
    evidenceHash: b.evidence_hash,
    previousEntryHash: b.previous_entry_hash,
    entryHash: b.entry_hash,
    canonicalPayload: b.canonical_payload,
    signatureHex: b.signature_hex,
    signer: {
      name: b.signer_name,
      badge: b.signer_badge,
      role: b.signer_role,
      agency: b.signer_agency,
      publicKeyJwk: JSON.parse(b.signer_public_key_jwk),
      publicKeyHex: b.signer_public_key_hex,
    },
  }));

  return {
    id: ev.id,
    caseNumber: ev.case_number,
    evidenceNumber: ev.evidence_number,
    title: ev.title,
    description: ev.description,
    fileName: ev.file_name,
    fileSize: ev.file_size,
    mimeType: ev.mime_type,
    sha256Hash: ev.sha256_hash,
    intakeTimestamp: ev.intake_timestamp,
    intakeOfficer: ev.intake_officer,
    currentCustodian: ev.current_custodian,
    storageLocation: ev.storage_location,
    custodyChain,
  };
}

/**
 * Register new evidence with its Genesis Block in a single database transaction
 */
export function insertEvidenceWithGenesis(record: EvidenceRecord): void {
  const insertEvidenceStmt = db.prepare(`
    INSERT INTO evidence (id, case_number, evidence_number, title, description, file_name, file_size, mime_type, sha256_hash, intake_timestamp, intake_officer, current_custodian, storage_location, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertBlockStmt = db.prepare(`
    INSERT INTO custody_chain (id, evidence_id, block_index, timestamp, action, from_party, to_party, location, notes, evidence_hash, previous_entry_hash, entry_hash, canonical_payload, signature_hex, signer_name, signer_badge, signer_role, signer_agency, signer_public_key_jwk, signer_public_key_hex, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createTx = db.transaction(() => {
    insertEvidenceStmt.run(
      record.id,
      record.caseNumber,
      record.evidenceNumber,
      record.title,
      record.description,
      record.fileName,
      record.fileSize,
      record.mimeType,
      record.sha256Hash,
      record.intakeTimestamp,
      record.intakeOfficer,
      record.currentCustodian,
      record.storageLocation,
      new Date().toISOString()
    );

    for (const block of record.custodyChain) {
      insertBlockStmt.run(
        block.id,
        record.id,
        block.index,
        block.timestamp,
        block.action,
        block.from,
        block.to,
        block.location,
        block.notes,
        block.evidenceHash,
        block.previousEntryHash,
        block.entryHash,
        block.canonicalPayload,
        block.signatureHex,
        block.signer.name,
        block.signer.badge || null,
        block.signer.role,
        block.signer.agency,
        JSON.stringify(block.signer.publicKeyJwk),
        block.signer.publicKeyHex,
        new Date().toISOString()
      );
    }
  });

  createTx();
}

/**
 * Append a newly signed custody block to an evidence chain using a transaction
 */
export function appendCustodyBlock(evidenceId: string, newBlock: CustodyEntry): EvidenceRecord {
  const insertBlockStmt = db.prepare(`
    INSERT INTO custody_chain (id, evidence_id, block_index, timestamp, action, from_party, to_party, location, notes, evidence_hash, previous_entry_hash, entry_hash, canonical_payload, signature_hex, signer_name, signer_badge, signer_role, signer_agency, signer_public_key_jwk, signer_public_key_hex, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateEvidenceStmt = db.prepare(`
    UPDATE evidence
    SET current_custodian = ?, storage_location = ?
    WHERE id = ?
  `);

  const appendTx = db.transaction(() => {
    // 1. Verify parent block continuity in DB
    const latestRow = db.prepare(`
      SELECT block_index, entry_hash
      FROM custody_chain
      WHERE evidence_id = ?
      ORDER BY block_index DESC
      LIMIT 1
    `).get(evidenceId) as { block_index: number; entry_hash: string } | undefined;

    if (!latestRow) {
      throw new Error(`Evidence ${evidenceId} has no genesis block.`);
    }

    if (newBlock.index !== latestRow.block_index + 1) {
      throw new Error(`Invalid block sequence index. Expected ${latestRow.block_index + 1}, received ${newBlock.index}.`);
    }

    if (newBlock.previousEntryHash.toLowerCase() !== latestRow.entry_hash.toLowerCase()) {
      throw new Error(`Broken chain pointer: previousEntryHash does not match prior block hash.`);
    }

    // 2. Insert new immutable block
    insertBlockStmt.run(
      newBlock.id,
      evidenceId,
      newBlock.index,
      newBlock.timestamp,
      newBlock.action,
      newBlock.from,
      newBlock.to,
      newBlock.location,
      newBlock.notes,
      newBlock.evidenceHash,
      newBlock.previousEntryHash,
      newBlock.entryHash,
      newBlock.canonicalPayload,
      newBlock.signatureHex,
      newBlock.signer.name,
      newBlock.signer.badge || null,
      newBlock.signer.role,
      newBlock.signer.agency,
      JSON.stringify(newBlock.signer.publicKeyJwk),
      newBlock.signer.publicKeyHex,
      new Date().toISOString()
    );

    // 3. Update active custodian & location on parent evidence record
    updateEvidenceStmt.run(newBlock.to, newBlock.location, evidenceId);
  });

  appendTx();

  const updated = getEvidenceById(evidenceId);
  if (!updated) throw new Error('Evidence not found after update.');
  return updated;
}

/**
 * Delete evidence record (cascades to all associated custody blocks)
 */
export function removeEvidence(id: string): void {
  const stmt = db.prepare('DELETE FROM evidence WHERE id = ?');
  stmt.run(id);
}

/**
 * Reset all tables and re-seed defaults
 */
export async function resetDatabase(): Promise<void> {
  const resetTx = db.transaction(() => {
    db.prepare('DELETE FROM custody_chain').run();
    db.prepare('DELETE FROM evidence').run();
    db.prepare('DELETE FROM officers').run();
  });
  resetTx();
  await seedIfEmpty();
}
