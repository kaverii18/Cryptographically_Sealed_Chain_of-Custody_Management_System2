# Cryptographically Sealed Chain of Custody Management System

A full-stack, enterprise-grade digital forensics chain of custody management application with client-side SHA-256 evidence hashing, server-backed immutable SQLite ledger, cryptographic digital signing via W3C Web Crypto API (ECDSA NIST P-256 / SHA-256), scannable physical QR evidence labeling, forensic tamper detection, and LSB media steganography.

---

## Architecture Overview

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Motion, Lucide Icons, QRCode.
- **Backend**: Express.js server running on Node.js with TypeScript (`tsx`).
- **Database**: SQLite (`better-sqlite3`) operating in WAL (Write-Ahead Logging) mode with database-level immutability triggers and transaction consistency.
- **Security & Cryptography**:
  - **FIPS 186-4 ECDSA P-256** digital signatures generated client-side and verified server-side.
  - **SHA-256 Hash Chain** binding each block to its parent ($H(B_n) \rightarrow H(B_{n-1})$).
  - **JWT Session Bearer Tokens** for authenticated custodians preventing unauthorized write operations.
  - **SQLite Triggers** that prevent `UPDATE` or partial `DELETE` on existing custody chain blocks.

---

## Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm** or **bun** / **yarn**

---

## Installation & Setup

1. **Clone the repository and enter the directory**:
   ```bash
   git clone <repo-url>
   cd <repo-folder>
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment (Optional)**:
   A `.env.example` file is provided. You can create a `.env` file if customizing the port or JWT secret:
   ```env
   PORT=3000
   JWT_SECRET="your-secure-jwt-secret-key-here"
   ```

---

## Running the Application

### Development Mode (Frontend + Express Backend on Port 3000)
Runs the integrated Express server which serves REST APIs under `/api/*` and mounts the Vite development middleware for instant frontend rendering:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build & Launch
1. **Compile the production frontend assets**:
   ```bash
   npm run build
   ```

2. **Start the production server**:
   ```bash
   npm start
   ```

3. **TypeScript Linting & Type Checking**:
   ```bash
   npm run lint
   ```

---

## REST API Documentation

### 1. System Health
- **`GET /api/health`**
  - Returns database connection status, SQLite WAL mode verification, registered counts for evidence, blocks, and officers.
  - **Response**: `200 OK`
    ```json
    {
      "status": "ok",
      "system": "Cryptographically Sealed Chain of Custody System",
      "database": "SQLite (WAL Mode with Immutability Triggers)",
      "counts": { "evidence": 2, "custodyBlocks": 6, "officers": 4 }
    }
    ```

### 2. Custodian Authentication
- **`POST /api/auth/token`**
  - Exchanges a valid registered custodian ID for a signed 24-hour JWT Bearer token.
  - **Body**: `{ "officerId": "<officer-uuid>" }`
  - **Response**: `200 OK` with `{ "token": "<jwt-bearer-token>", "officer": { ... } }`

### 3. Custodian & Actor Management
- **`GET /api/officers`**
  - Returns all registered custodians and their ECDSA P-256 public keys.
- **`POST /api/officers`**
  - Registers a new custodian keypair.
  - **Headers**: `Authorization: Bearer <token>`
  - **Body**: `{ "id", "name", "badge", "role", "agency", "publicKeyJwk", "privateKeyJwk", "publicKeyHex" }`

### 4. Evidence Management
- **`GET /api/evidence`**
  - Lists all registered evidence items with their ordered custody chain blocks.
- **`GET /api/evidence/:id`**
  - Fetches a single evidence item with its complete cryptographic ledger.
- **`POST /api/evidence`**
  - Registers a new evidence item with its sealed Genesis Block #0.
  - **Headers**: `Authorization: Bearer <token>`
  - **Validation**: Enforces root SHA-256 hash, non-empty identifiers, and server-side verification of Block #0's ECDSA digital signature.
- **`DELETE /api/evidence/:id`**
  - Deletes an evidence item and cascades to its custody history. Requires custodian authentication.

### 5. Custody Transfers (Append-Only Chain Blocks)
- **`POST /api/evidence/:id/custody`**
  - Appends a new sealed custody block to the evidence chain.
  - **Headers**: `Authorization: Bearer <token>`
  - **Server-Side Audits Performed Prior to Commit**:
    1. Parent Hash Invariant: Validates `newBlock.previousEntryHash === priorBlock.entryHash`.
    2. Sequential Index Invariant: Validates `newBlock.index === priorBlock.index + 1`.
    3. Canonical Data Hash: Recomputes deterministic SHA-256 and validates against `newBlock.entryHash`.
    4. Digital Signature Verification: Validates `newBlock.signatureHex` using Web Crypto API against the custodian's registered public key JWK.
  - **Commit**: Executed inside an SQLite database transaction.

### 6. Cryptographic Chain Verification
- **`POST /api/verify/chain`**
  - Server-side independent audit validating:
    - Genesis Root Evidence Invariant
    - Sequential Hash Chain Pointer Continuity
    - ECDSA P-256 Digital Signatures for every block.
  - **Body**: `{ "evidenceId": "<evidence-id>", "uploadedFileHash": "<optional-sha256>" }`

### 7. Reset Demonstration Data
- **`POST /api/reset`**
  - Resets SQLite database tables and re-seeds with realistic initial demonstration forensic cases and keypairs.

---

## Database Architecture (`custody.db`)

The SQLite database is stored locally at `./data/custody.db`.

```
+------------------------------------------------------------------------+
|                                evidence                                |
|------------------------------------------------------------------------|
| id (PK) | case_number | evidence_number (UNIQUE) | sha256_hash | ...   |
+------------------------------------------------------------------------+
                                    |
                                    | 1 : N (CASCADE DELETE)
                                    v
+------------------------------------------------------------------------+
|                              custody_chain                             |
|------------------------------------------------------------------------|
| id (PK) | evidence_id (FK) | block_index | previous_entry_hash (IMMUT) |
| entry_hash (UNIQUE)        | canonical_payload   | signature_hex       |
| signer_name | signer_role  | signer_public_key_hex                     |
+------------------------------------------------------------------------+
  * Database Trigger prevents UPDATE on custody_chain.
  * Unique constraint on (evidence_id, block_index) prevents forks.
```

---

## Testing & Verification

Run the test suite and verify endpoints:

```bash
# 1. Verify TypeScript types across client and server
npm run lint

# 2. Test production build bundle
npm run build

# 3. Test API Health Endpoint
curl http://localhost:3000/api/health
```

---

## License

Apache-2.0
