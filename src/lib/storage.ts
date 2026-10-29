/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EvidenceRecord, OfficerIdentity } from '../types/custody';
import { generateInitialIdentitiesAndEvidence } from './sampleData';

const STORAGE_KEYS = {
  EVIDENCE: 'coc_evidence_records_v1',
  OFFICERS: 'coc_officers_v1',
  ACTIVE_OFFICER: 'coc_active_officer_id_v1',
};

export function getStoredEvidence(): EvidenceRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.EVIDENCE);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse stored evidence:', e);
    return [];
  }
}

export function saveAllEvidence(records: EvidenceRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.EVIDENCE, JSON.stringify(records));
  } catch (e) {
    console.error('Failed to save evidence list:', e);
  }
}

export function saveEvidence(record: EvidenceRecord): void {
  const list = getStoredEvidence();
  const existingIdx = list.findIndex((e) => e.id === record.id);
  if (existingIdx >= 0) {
    list[existingIdx] = record;
  } else {
    list.unshift(record);
  }
  saveAllEvidence(list);
}

export function deleteEvidence(id: string): void {
  const list = getStoredEvidence().filter((e) => e.id !== id);
  saveAllEvidence(list);
}

export function getStoredOfficers(): OfficerIdentity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFICERS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse officers:', e);
    return [];
  }
}

export function saveOfficer(officer: OfficerIdentity): void {
  const officers = getStoredOfficers();
  const idx = officers.findIndex((o) => o.id === officer.id);
  if (idx >= 0) {
    officers[idx] = officer;
  } else {
    officers.push(officer);
  }
  localStorage.setItem(STORAGE_KEYS.OFFICERS, JSON.stringify(officers));
}

export function getActiveOfficer(): OfficerIdentity | null {
  const officers = getStoredOfficers();
  if (officers.length === 0) return null;
  const activeId = localStorage.getItem(STORAGE_KEYS.ACTIVE_OFFICER);
  if (activeId) {
    const found = officers.find((o) => o.id === activeId);
    if (found) return found;
  }
  return officers[0];
}

export function setActiveOfficerId(id: string): void {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_OFFICER, id);
}

export async function initStorage(): Promise<{
  evidence: EvidenceRecord[];
  officers: OfficerIdentity[];
  activeOfficer: OfficerIdentity | null;
}> {
  let evidence = getStoredEvidence();
  let officers = getStoredOfficers();

  if (evidence.length === 0 || officers.length === 0) {
    const initial = await generateInitialIdentitiesAndEvidence();
    officers = initial.officers;
    evidence = initial.evidenceList;
    localStorage.setItem(STORAGE_KEYS.OFFICERS, JSON.stringify(officers));
    localStorage.setItem(STORAGE_KEYS.EVIDENCE, JSON.stringify(evidence));
    if (officers.length > 0) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_OFFICER, officers[0].id);
    }
  }

  const activeOfficer = getActiveOfficer();
  return { evidence, officers, activeOfficer };
}

export async function resetToDefaults(): Promise<{
  evidence: EvidenceRecord[];
  officers: OfficerIdentity[];
  activeOfficer: OfficerIdentity | null;
}> {
  localStorage.removeItem(STORAGE_KEYS.EVIDENCE);
  localStorage.removeItem(STORAGE_KEYS.OFFICERS);
  localStorage.removeItem(STORAGE_KEYS.ACTIVE_OFFICER);
  return await initStorage();
}
