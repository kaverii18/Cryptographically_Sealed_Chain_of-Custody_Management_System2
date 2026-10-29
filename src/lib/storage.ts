/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EvidenceRecord, OfficerIdentity, CustodyEntry } from '../types/custody';
import {
  apiGetEvidence,
  apiGetOfficers,
  apiCreateEvidence,
  apiAppendCustodyBlock,
  apiDeleteEvidence,
  apiCreateOfficer,
  apiResetDatabase,
  ApiError,
} from './api';

const STORAGE_KEYS = {
  EVIDENCE_CACHE: 'coc_evidence_cache_v1',
  OFFICERS_CACHE: 'coc_officers_cache_v1',
  ACTIVE_OFFICER: 'coc_active_officer_id_v1',
};

// ==========================================
// OFFLINE CACHE HELPERS (Secondary fallback)
// ==========================================
export function getCachedEvidence(): EvidenceRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EVIDENCE_CACHE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setCachedEvidence(records: EvidenceRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.EVIDENCE_CACHE, JSON.stringify(records));
  } catch {
    // Ignore quota issues
  }
}

export function getCachedOfficers(): OfficerIdentity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFICERS_CACHE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setCachedOfficers(officers: OfficerIdentity[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.OFFICERS_CACHE, JSON.stringify(officers));
  } catch {
    // Ignore quota issues
  }
}

export function getActiveOfficerId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_OFFICER);
  } catch {
    return null;
  }
}

export function setActiveOfficerId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_OFFICER, id);
  } catch {
    // Ignore
  }
}

// ==========================================
// PRIMARY SQLITE BACKEND OPERATIONS
// ==========================================

/**
 * Initialize storage from SQLite backend with local cache synchronization
 */
export async function initStorage(): Promise<{
  evidence: EvidenceRecord[];
  officers: OfficerIdentity[];
  activeOfficer: OfficerIdentity | null;
}> {
  try {
    // 1. Fetch live data from SQLite backend
    const [evidence, officers] = await Promise.all([
      apiGetEvidence(),
      apiGetOfficers(),
    ]);

    // Update local offline cache
    setCachedEvidence(evidence);
    setCachedOfficers(officers);

    // Resolve active custodian
    let activeOfficer: OfficerIdentity | null = null;
    const storedActiveId = getActiveOfficerId();
    if (storedActiveId) {
      activeOfficer = officers.find((o) => o.id === storedActiveId) || officers[0] || null;
    } else if (officers.length > 0) {
      activeOfficer = officers[0];
      setActiveOfficerId(officers[0].id);
    }

    return { evidence, officers, activeOfficer };
  } catch (err) {
    console.warn('Backend unavailable during initialization, checking local offline cache:', err);
    const cachedEvidence = getCachedEvidence();
    const cachedOfficers = getCachedOfficers();
    const activeOfficer = cachedOfficers.length > 0 ? cachedOfficers[0] : null;

    if (cachedEvidence.length === 0 && cachedOfficers.length === 0) {
      throw new Error(
        'Cannot connect to backend database and no offline cache exists. Ensure the backend server is running.'
      );
    }

    return { evidence: cachedEvidence, officers: cachedOfficers, activeOfficer };
  }
}

/**
 * Register new evidence with sealed Genesis Block in SQLite
 * Critical write: does NOT fall back to localStorage on failure to prevent false state
 */
export async function saveEvidence(
  record: EvidenceRecord,
  activeOfficerId: string
): Promise<EvidenceRecord> {
  try {
    const created = await apiCreateEvidence(record, activeOfficerId);
    // Update offline cache after verified backend persistence
    const current = getCachedEvidence();
    setCachedEvidence([created, ...current.filter((e) => e.id !== created.id)]);
    return created;
  } catch (err: any) {
    console.error('Failed to persist evidence to backend database:', err);
    throw new Error(
      `Database Persistence Error: ${err.message || 'Server rejected evidence registration'}. Evidence was NOT saved.`
    );
  }
}

/**
 * Append a newly signed custody block to the SQLite chain
 * Critical write: throws error on failure
 */
export async function appendCustodyBlock(
  evidenceId: string,
  block: CustodyEntry,
  activeOfficerId: string
): Promise<EvidenceRecord> {
  try {
    const updated = await apiAppendCustodyBlock(evidenceId, block, activeOfficerId);
    // Update offline cache after verified backend persistence
    const current = getCachedEvidence();
    setCachedEvidence(current.map((e) => (e.id === updated.id ? updated : e)));
    return updated;
  } catch (err: any) {
    console.error('Failed to append custody block to backend database:', err);
    throw new Error(
      `Custody Block Persistence Error: ${err.message || 'Server rejected custody block'}. Block was NOT appended.`
    );
  }
}

/**
 * Delete an evidence record from SQLite
 */
export async function deleteEvidence(
  id: string,
  activeOfficerId: string
): Promise<void> {
  try {
    await apiDeleteEvidence(id, activeOfficerId);
    const current = getCachedEvidence().filter((e) => e.id !== id);
    setCachedEvidence(current);
  } catch (err: any) {
    console.error('Failed to delete evidence from backend database:', err);
    throw new Error(`Deletion Error: ${err.message || 'Server failed to delete evidence'}.`);
  }
}

/**
 * Register a new officer identity in SQLite
 */
export async function saveOfficer(
  officer: OfficerIdentity,
  activeOfficerId: string
): Promise<OfficerIdentity> {
  try {
    const created = await apiCreateOfficer(officer, activeOfficerId);
    const current = getCachedOfficers();
    setCachedOfficers([...current.filter((o) => o.id !== created.id), created]);
    return created;
  } catch (err: any) {
    console.error('Failed to persist officer identity to backend database:', err);
    throw new Error(`Officer Registration Error: ${err.message || 'Server failed to register officer'}.`);
  }
}

/**
 * Reset backend database to default cryptographic demo state
 */
export async function resetToDefaults(): Promise<{
  evidence: EvidenceRecord[];
  officers: OfficerIdentity[];
  activeOfficer: OfficerIdentity | null;
}> {
  try {
    const res = await apiResetDatabase();
    setCachedEvidence(res.evidence);
    setCachedOfficers(res.officers);
    const activeOfficer = res.officers.length > 0 ? res.officers[0] : null;
    if (activeOfficer) setActiveOfficerId(activeOfficer.id);
    return { evidence: res.evidence, officers: res.officers, activeOfficer };
  } catch (err: any) {
    console.error('Failed to reset backend database:', err);
    throw new Error(`Database Reset Failed: ${err.message}`);
  }
}
