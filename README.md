# JobBridge

JobBridge is a minimal, purpose-built job board for member organizations and job seekers. It provides a public job-search experience, organization onboarding, controlled job publishing, and administrator review.

## Current Status

The MVP is deployed and working in the WSO2 Developer Platform with:

- React + Vite web application
- WSO2 Integrator / Ballerina backend integration
- Devant-managed MySQL persistence
- Asgardeo OIDC authentication and self-registration
- Role-aware navigation
- Organization approval and rejection
- Job approval and rejection
- Project-level UI-to-API connectivity through `/choreo-apis/...`
- Runtime database configuration through a configuration group
- JobBridge branding in the Asgardeo login experience

Bijira API management is planned as a later hardening/governance phase.

## Current Deployment Overview

```text
Users
  |
  v
JobBridge React/Vite Web Application
WSO2 Developer Platform
  |
  | /choreo-apis/jobbridge/jobboardapi/v1
  v
JobBridge Integration API
WSO2 Integrator / Ballerina
  |
  | Runtime configuration group
  v
Devant-managed MySQL
  |
  +-- jobs
  +-- organizations

Asgardeo
  +-- OIDC authentication
  +-- Self-registration
  +-- User identity
  +-- Application roles
  +-- JobBridge login branding
```

The React application uses Asgardeo for user authentication. OAuth 2 enforcement on the JobBridge API is currently disabled for the MVP. API-level OAuth, scopes, and stronger backend authorization are planned for a later phase.

## User Roles

| Role | Purpose |
|---|---|
| `ADMIN` | Reviews organization applications and job postings |
| `MEMBER_ORGANIZATION` | Posts jobs after organization approval |
| `JOB_SEEKER` | Browses and applies for jobs |

A newly self-registered user may temporarily have no JobBridge role while an organization application is pending.

## Implemented Features

### Public and job-seeker experience

- View active job postings
- Search jobs
- Open external job application links
- Sign in and sign out with Asgardeo

### Member organization experience

- Self-register through Asgardeo
- Submit an organization application
- View organization application status
- Submit a job for administrator review
- Display member-specific navigation based on the signed-in user's role

### Administrator experience

- View pending organization applications
- Approve or reject organizations
- View pending job postings
- Approve or reject jobs

## API Summary

```http
GET  /api/jobs
POST /api/jobs

POST /api/organizations
GET  /api/organizations/me?ownerUserId={userId}

GET /api/admin/jobs/pending
PUT /api/admin/jobs/{id}/approve
PUT /api/admin/jobs/{id}/reject

GET /api/admin/organizations/pending
PUT /api/admin/organizations/{id}/approve
PUT /api/admin/organizations/{id}/reject
```

The deployed web application reaches the backend through the project connection path:

```text
/choreo-apis/jobbridge/jobboardapi/v1
```

For example:

```text
/choreo-apis/jobbridge/jobboardapi/v1/jobs
```

See [API Reference](docs/api-reference.md) for endpoint details.

## Repository Structure

```text
local-job-board/
├── README.md
├── docs/
├── job_board_api/
├── job-board-ui/
└── Ballerina.toml
```

The repository is a monorepo. The backend and frontend use separate component directories when imported into the platform.

## Backend Configuration

The backend currently uses these Ballerina configurables:

```ballerina
configurable string mysqlUser = ?;
configurable string mysqlHost = ?;
configurable string mysqlPassword = ?;
configurable string mysqlDatabase = ?;
configurable int mysqlPort = ?;
```

In the deployed environment, these values are supplied through a Developer Platform / Devant configuration group. Database credentials are not stored in GitHub.

A local `Config.toml` may still be used for local development, but the real credentials must not be committed.

## Frontend Runtime Configuration

The deployed React application uses a runtime configuration file:

```text
job-board-ui/public/config.js
```

Example:

```javascript
window.configs = {
  apiUrl: "/choreo-apis/jobbridge/jobboardapi/v1"
};
```

The application resolves the API base URL with:

```javascript
const API_BASE_URL =
  window?.configs?.apiUrl ||
  import.meta.env.VITE_API_BASE_URL ||
  "/api";
```

This preserves local development while allowing the deployed application to use the Developer Platform project connection.

## Asgardeo Configuration

The React application uses Asgardeo OIDC.

The deployed callback is derived dynamically:

```javascript
const appUrl = window.location.origin;
```

and used for both:

```javascript
signInRedirectURL: appUrl,
signOutRedirectURL: appUrl,
```

Asgardeo must contain exact matching redirect URLs for local and deployed environments. A trailing slash difference can cause a callback mismatch.

The JobBridge logo is hosted by the web application and referenced from Asgardeo using its public PNG URL.

## Local Run

### Local MySQL Database

Before running the backend locally, start a local MySQL instance and create the `jobbridge` database.

Example:

```sql
CREATE DATABASE IF NOT EXISTS jobbridge
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE jobbridge;
```

Create the required tables:

```sql
CREATE TABLE organizations (
    id VARCHAR(36) PRIMARY KEY,
    owner_user_id VARCHAR(255) NOT NULL,
    name VARCHAR(150) NOT NULL,
    website VARCHAR(255),
    contact_name VARCHAR(150) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_organizations_owner_user_id (owner_user_id)
);

CREATE TABLE jobs (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    organization VARCHAR(150) NOT NULL,
    location VARCHAR(150) NOT NULL,
    employment_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    apply_url VARCHAR(500) NOT NULL,
    salary_min DECIMAL(12,2) NULL,
    salary_max DECIMAL(12,2) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Verify:

```sql
SHOW TABLES;
DESCRIBE organizations;
DESCRIBE jobs;
```

For local development, create `job_board_api/Config.toml` with values matching your local MySQL instance:

```toml
mysqlUser = "root"
mysqlHost = "localhost"
mysqlPassword = "replace-with-local-password"
mysqlDatabase = "jobbridge"
mysqlPort = 3306
```

Do not commit the real `Config.toml` to GitHub.

### Backend

Run `job_board_api` from WSO2 Integrator.

Typical local API URL:

```text
http://localhost:9090/api
```

### Frontend

```bash
cd job-board-ui
npm install
npm run dev
```

Typical local frontend URL:

```text
http://localhost:5173
```

## Current Limitations

- API OAuth 2 enforcement is currently disabled.
- Backend authorization is not yet the final authority for all role-sensitive operations.
- `GET /api/organizations/me` currently accepts `ownerUserId` from the browser.
- Organization approval does not automatically assign the Asgardeo `MEMBER_ORGANIZATION` role.
- Jobs currently store an organization name rather than an `organization_id` foreign key.
- API error responses should be standardized.
- Bijira API management is not yet configured.

## Next Steps

1. Add Bijira as the governed API-management layer.
2. Enable API authentication and authorization when the API security model is finalized.
3. Validate Asgardeo-issued tokens at the API layer.
4. Enforce roles and ownership in the backend.
5. Add an `organization_id` relationship to jobs.
6. Automate Asgardeo role assignment after organization approval.
7. Add production-grade backups, monitoring, alerting, and auditing.
