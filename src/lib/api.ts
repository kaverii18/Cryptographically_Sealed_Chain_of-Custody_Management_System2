/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EvidenceRecord, CustodyEntry, OfficerIdentity, ChainVerificationResult } from '../types/custody';

export class ApiError extends Error {
  status: number;
  details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// In-memory token cache for authenticated custodian sessions
let activeToken: string | null = null;
let activeTokenOfficerId: string | null = null;

/**
 * Acquire or retrieve a signed JWT custodian token from the server
 */
export async function getCustodianAuthToken(officerId: string): Promise<string> {
  if (activeToken && activeTokenOfficerId === officerId) {
    return activeToken;
  }

  const res = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ officerId }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(
      errBody.message || 'Custodian authentication failed.',
      res.status,
      errBody
    );
  }

  const data = await res.json();
  activeToken = data.token;
  activeTokenOfficerId = officerId;
  return data.token;
}

/**
 * Low-level authenticated fetch helper
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  requiringOfficerId?: string
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (requiringOfficerId) {
    try {
      const token = await getCustodianAuthToken(requiringOfficerId);
      headers.set('Authorization', `Bearer ${token}`);
    } catch (err: any) {
      console.warn('Authentication token retrieval issue:', err);
    }
  } else if (activeToken) {
    headers.set('Authorization', `Bearer ${activeToken}`);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(
      errData.message || `Request failed with status ${response.status}`,
      response.status,
      errData
    );
  }

  return response.json();
}

/**
 * System Health
 */
export async function apiGetHealth(): Promise<any> {
  return request('/api/health');
}

/**
 * Fetch all officers from SQLite database
 */
export async function apiGetOfficers(): Promise<OfficerIdentity[]> {
  return request<OfficerIdentity[]>('/api/officers');
}

/**
 * Register a new officer in the backend database
 */
export async function apiCreateOfficer(
  officer: OfficerIdentity,
  signingOfficerId: string
): Promise<OfficerIdentity> {
  return request<OfficerIdentity>(
    '/api/officers',
    {
      method: 'POST',
      body: JSON.stringify(officer),
    },
    signingOfficerId
  );
}

/**
 * Fetch all evidence records and their chains from SQLite database
 */
export async function apiGetEvidence(): Promise<EvidenceRecord[]> {
  return request<EvidenceRecord[]>('/api/evidence');
}

/**
 * Fetch single evidence item by ID
 */
export async function apiGetEvidenceById(id: string): Promise<EvidenceRecord> {
  return request<EvidenceRecord>(`/api/evidence/${id}`);
}

/**
 * Register new evidence with sealed Genesis Block #0
 */
export async function apiCreateEvidence(
  record: EvidenceRecord,
  custodianId: string
): Promise<EvidenceRecord> {
  return request<EvidenceRecord>(
    '/api/evidence',
    {
      method: 'POST',
      body: JSON.stringify(record),
    },
    custodianId
  );
}

/**
 * Append a newly signed custody block to the SQLite chain
 */
export async function apiAppendCustodyBlock(
  evidenceId: string,
  block: CustodyEntry,
  signingCustodianId: string
): Promise<EvidenceRecord> {
  return request<EvidenceRecord>(
    `/api/evidence/${evidenceId}/custody`,
    {
      method: 'POST',
      body: JSON.stringify(block),
    },
    signingCustodianId
  );
}

/**
 * Delete an evidence record from the backend database
 */
export async function apiDeleteEvidence(
  id: string,
  custodianId: string
): Promise<{ message: string }> {
  return request<{ message: string }>(
    `/api/evidence/${id}`,
    {
      method: 'DELETE',
    },
    custodianId
  );
}

/**
 * Server-Side Cryptographic Chain Audit
 */
export async function apiVerifyChainOnServer(
  evidenceId: string,
  uploadedFileHash?: string
): Promise<ChainVerificationResult> {
  return request<ChainVerificationResult>('/api/verify/chain', {
    method: 'POST',
    body: JSON.stringify({ evidenceId, uploadedFileHash }),
  });
}

/**
 * Reset backend database to default demo state
 */
export async function apiResetDatabase(): Promise<{ message: string; evidence: EvidenceRecord[]; officers: OfficerIdentity[] }> {
  return request('/api/reset', { method: 'POST' });
}
