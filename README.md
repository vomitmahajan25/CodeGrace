# Trustcred

**Evidence-led credit assessment and loan workflow**

Trustcred is a full-stack alternative-credit platform that helps underserved borrowers access formal lending by combining utility payment history, income patterns, business records, and traditional documents into one transparent, human-supervised decision workflow.

This folder is a complete Hatchable project. Everything the app needs lives here: static pages, API routes, database migrations, shared libraries, and the `hatchable.toml` manifest that declares required secrets and services.

---

## Overview

Traditional credit bureaus often exclude people with thin or non-existent formal credit files. Trustcred replaces opaque bureau scores with an **evidence-first** process:

- Customers upload real-world documents (utility bills, income proofs, business records).
- Lenders review each document, extract structured metrics, and record an evidence assessment.
- An experimental linear model produces a Trustcred Score, Bill-Payment Score, and eligibility estimate, accompanied by SHAP-style feature attributions.
- A single designated LoanOfficer makes the final approval or decline decision with a written rationale.
- Approved applications can be assigned to a verified lender for funding and disbursement tracking.

Every critical action is written to an immutable audit log.

---

## Problem & Solution

| Challenge | Trustcred Approach |
|-----------|--------------------|
| Thin-file / no-file borrowers | Accept alternative data (utility payments, income patterns, business activity) |
| Black-box scores | Transparent experimental score + SHAP explanations |
| Lack of accountability | Role-based access, written rationales, full audit trail |
| Lender onboarding friction | Eligibility checklist + access-code gated registration |
| Single point of administrative control | Exactly one LoanOfficer account, bootstrapped by site owner |

---

## Core Principles

1. **Evidence over assumptions** – Scores are derived only from lender-verified metrics, never from self-reported claims alone.
2. **Human-in-the-loop** – Machine estimates assist; final credit decisions remain with a human LoanOfficer.
3. **Explainability** – Every score ships with feature-level attributions so reviewers understand *why*.
4. **Least privilege** – Customers, lenders, and the LoanOfficer have strictly separated capabilities.
5. **Auditability** – Every status change, document review, recommendation, and funding action is logged.

---

## User Roles

| Role | Capabilities |
|------|--------------|
| **Customer** | Register, create applications, upload documents, view status and scores after review |
| **Lender** | Register (after eligibility + access code), review assigned applications, extract metrics, submit evidence assessments, optionally fund approved loans |
| **LoanOfficer** | Single privileged account; views all applications, reviews SHAP explanations, issues final approve/decline decisions, manages lender eligibility and access codes |

The LoanOfficer account can be created only once, using a pre-configured email and a one-time bootstrap code.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                            │
│  public/index.html  ·  public/app.js  ·  public/styles.css      │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS / JSON
┌────────────────────────────▼────────────────────────────────────┐
│                     Hatchable Runtime                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  API Routes  │  │  Shared Lib  │  │  Hatchable Services  │  │
│  │  /api/*      │◄─┤  trustcred   │◄─┤  db · storage · email│  │
│  │              │  │  security    │  │                      │  │
│  │              │  │  account-svc │  └──────────────────────┘  │
│  └──────┬───────┘  └──────────────┘                            │
│         │                                                       │
│  ┌──────▼───────────────────────────────────────────────────┐  │
│  │              PostgreSQL (managed by Hatchable)            │  │
│  │  app_users · applications · documents · evidence_…        │  │
│  │  lenders · lender_access_codes · audit_events · …         │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Object Storage (document blobs)              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Key design choices**

- **Serverless-style API routes** – Each file under `api/` is an independent HTTP handler. Hatchable routes requests by path.
- **Shared library layer** – Authentication, authorization, audit writing, and common queries live in `lib/` so every route stays thin.
- **Cookie-based sessions** – Opaque session tokens stored as HttpOnly cookies; only the SHA-256 hash is kept in the database.
- **Document storage** – Files are uploaded to Hatchable object storage; temporary signed URLs are generated on demand.
- **Email service** – Verification codes, password-reset links, and notifications are sent through Hatchable’s email integration.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime / Hosting | **Hatchable** (managed serverless platform) |
| Language | JavaScript (ES modules) |
| Frontend | Vanilla HTML / CSS / JS SPA (`public/`) |
| Backend | Hatchable API route handlers (`api/`) |
| Database | PostgreSQL (Hatchable-managed) |
| Object Storage | Hatchable Storage (S3-compatible) |
| Email | Hatchable Email service |
| Auth | Cookie sessions + PBKDF2-style password derivation (310 k iterations) |
| Scoring | Deterministic linear model + SHAP-style attributions (pure JS) |
| Migrations | Ordered SQL files under `migrations/` |
| Secrets | Declared in `hatchable.toml` |

No external ML frameworks or heavy dependencies are required; the scoring logic runs entirely inside the API route.

---

## Data Model

Core tables (simplified):

- **app_users** – Customers, lenders, and the single LoanOfficer. Stores role, password hash/salt/iterations, email-verification state.
- **auth_sessions** – Hashed session tokens with expiry.
- **applications** – Loan requests with status machine, scores, recommendations, funding fields.
- **documents** – Uploaded files linked to an application; review status and reason.
- **evidence_assessments** – Structured metrics extracted by a lender + resulting scores and SHAP payload.
- **lenders** – Extended lender profile (organization, capacity, eligibility).
- **lender_access_codes** – One-time or reusable codes that gate lender registration.
- **lender_eligibility_checks** – Snapshot of eligibility evaluation results.
- **audit_events** – Immutable log of every significant action.

Application status progression (high level):

```
draft → submitted → under_review → evidence_complete
      → loanofficer_review → approved / declined
      → funded (when disbursement is recorded)
```

Funding status is tracked independently: `not_assigned → assigned → disbursed`.

---

## End-to-End Workflow

### 1. Customer journey
1. Register with email + strong password.
2. Verify email via one-time code.
3. Create a new application (business details, requested amount, tenure, purpose).
4. Upload supporting documents (utility bills, income proofs, ID, etc.).
5. Submit the application.
6. Track status; once a lender has completed the evidence assessment the customer can see the experimental scores.

### 2. Lender journey
1. Complete an eligibility questionnaire (organization type, registration number, capacity, experience).
2. If eligible, receive or use an access code issued by the LoanOfficer.
3. Register a lender account.
4. View applications assigned for review (or pick up new ones according to product rules).
5. Open each document, mark it verified / rejected, and record structured metrics (on-time bill payments, income stability, business vintage, etc.).
6. Submit the evidence assessment → system calculates Trustcred Score, Bill-Payment Score, eligible amount, and SHAP explanation.
7. Optionally leave a recommendation for the LoanOfficer.
8. For approved applications assigned to them, record disbursement details (amount, reference, date).

### 3. LoanOfficer journey
1. Bootstrap the single LoanOfficer account using the configured email + private bootstrap code.
2. Review the dashboard: all applications, lender roster, customer list, recent audit events.
3. Open an application that has reached `loanofficer_review`.
4. Inspect documents, evidence metrics, scores, and SHAP feature attributions.
5. Issue a final decision (approve / decline) with a mandatory written rationale and optional approved amount.
6. Manage lender access codes and eligibility notes.

---

## Scoring & Explainability

Scoring lives in `api/assessments.js` and is intentionally simple and transparent:

- **Inputs** are only the numeric metrics that a lender typed after reviewing real documents.
- A weighted linear combination produces:
  - **Trustcred Score** (0–100)
  - **Bill-Payment Score**
  - **Eligible amount** estimate
- **SHAP-style attributions** show the contribution of each feature to the final score so the LoanOfficer can see which signals drove the result.
- Model version is stored (`evidence-linear-v2`) so future model changes remain auditable.

Important design rule (enforced in code comments):  
*Scores must never be generated from document counts or the customer’s unverified self-reported income alone.*

---

## Security Model

- Passwords: derived with a high-iteration key-derivation function (310 000 iterations) + unique salt.
- Sessions: long random tokens; only the SHA-256 hash is stored; cookies are HttpOnly / Secure.
- Authorization: every mutating route calls `requireActor()` with an explicit role allow-list.
- LoanOfficer bootstrap: gated by two secrets (`TRUSTCRED_LOANOFFICER_EMAIL` + `TRUSTCRED_LOANOFFICER_BOOTSTRAP_CODE`).
- Document access: temporary signed storage URLs (short TTL).
- Constant-time comparison for password and code verification to reduce timing attacks.
- Audit log captures actor role, name, action, reason, and timestamp for every sensitive operation.

---

## API Surface

| Path | Purpose |
|------|---------|
| `POST /api/account/register` | Customer registration |
| `POST /api/account/login` / `logout` | Session management |
| `POST /api/account/verify-email` | Email verification |
| `POST /api/account/password-reset` | Password recovery |
| `POST /api/account/lender-register` | Lender registration (access-code gated) |
| `POST /api/account/loanofficer-setup` | One-time LoanOfficer bootstrap |
| `GET  /api/account/status` | Current session info |
| `GET/POST /api/applications` | List / create applications |
| `GET/PATCH /api/applications/[id]` | Application detail & updates |
| `POST /api/documents` | Upload documents |
| `POST /api/documents/review` | Lender document verification |
| `POST /api/assessments` | Submit evidence metrics → scores |
| `POST /api/workflow` | Status transitions, recommendations, final decisions, funding |
| `GET  /api/dashboard` | Role-aware dashboard data |
| `GET/POST /api/lenders` | Lender roster & eligibility management |

All routes expect JSON and return JSON. Authentication is via the session cookie.

---

## Project Structure

```
trustcred/
├── hatchable.toml          # App name, description, required secrets
├── README.md               # This file
├── migrations/
│   ├── 001_trustcred_schema.sql
│   ├── 002_real_accounts.sql
│   ├── 003_account_hardening.sql
│   ├── 004_evidence_assessments.sql
│   ├── 005_loanofficer_and_funding.sql
│   └── 006_lender_eligibility.sql
├── lib/
│   ├── trustcred.js        # Actor helpers, audit writer, common queries
│   ├── security.js         # Crypto, cookies, password derivation
│   └── account-service.js  # Registration, sessions, codes
├── api/
│   ├── account/            # Auth & onboarding routes
│   ├── applications/       # Application CRUD
│   ├── documents/          # Upload & review
│   ├── assessments.js      # Scoring engine
│   ├── workflow.js         # State machine & decisions
│   ├── dashboard.js        # Aggregated views
│   └── lenders.js          # Lender management
└── public/
    ├── index.html          # SPA shell
    ├── app.js              # Client-side logic & UI
    ├── styles.css          # Design system
    ├── privacy.html
    └── terms.html
```

---

## Running Your Own Copy

1. Go to [https://hatchable.com/deploy](https://hatchable.com/deploy).
2. Upload this folder as a `.zip`, or point the importer at a Git repository that contains it.
3. Hatchable provisions a dedicated database, object storage, and a unique public URL.
4. Supply the two required secrets (see below).
5. The first person to hit the LoanOfficer setup endpoint with the correct email + bootstrap code becomes the site administrator.

After deployment you have a fully isolated instance: your own data, your own keys, your own LoanOfficer.

---

## Configuration Secrets

Declared in `hatchable.toml`:

| Secret | Required | Description |
|--------|----------|-------------|
| `TRUSTCRED_LOANOFFICER_EMAIL` | Yes | Exact email address that is allowed to become the single LoanOfficer |
| `TRUSTCRED_LOANOFFICER_BOOTSTRAP_CODE` | Yes | Private one-time passcode (≥ 32 characters) used only during first-time LoanOfficer initialization |

Keep the bootstrap code offline and rotate it after the LoanOfficer account has been created.

---

## Audit & Compliance

Every significant event is written to `audit_events`:

- Application creation / submission
- Document upload and review decisions
- Evidence assessment submission
- Lender recommendation
- LoanOfficer final decision (including reason)
- Funding assignment and disbursement
- Account lifecycle events

The dashboard exposes the most recent 100 events. Because the log is append-only and includes actor identity, it provides a clear chain of custody for regulatory or internal review.

---

## Future Extensions

Possible directions that fit the current architecture:

- Pluggable scoring models (still required to emit SHAP-compatible attributions)
- Multi-LoanOfficer support with hierarchical approval
- Integration with external payment rails for automatic disbursement confirmation
- Customer mobile progressive-web-app experience
- Richer document OCR pre-fill to reduce lender data-entry effort
- Configurable eligibility rule engine for different lending products

---

## About Hatchable

Hatchable is the platform where AI-built apps go live. Connect the AI tools you already use and it can build, deploy, and operate applications like Trustcred for you.

Built on Hatchable → [https://hatchable.com](https://hatchable.com)

---

*Trustcred — Evidence over assumptions. Humans in charge.*
