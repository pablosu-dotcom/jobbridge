# JobBridge

JobBridge is a minimal, purpose-built job board for member organizations and job seekers. It provides a simple public job-search experience, an organization onboarding workflow, controlled job publishing, and administrator review.

## Current Status

The local MVP is working with:

- React and Vite frontend
- WSO2 Integrator: BI backend
- MySQL persistence
- Asgardeo authentication and self-registration
- Role-aware navigation
- Organization approval and rejection
- Job approval and rejection

Cloud deployment is planned for Devant. Bijira will later manage the integration service as a governed API.

## Solution Overview

```text
Users
  |
  v
JobBridge React Web App
  |
  | OAuth access token
  v
Bijira API Gateway (planned)
  |
  v
JobBridge Integration Service
WSO2 Integrator: BI on Devant
  |
  v
Managed MySQL

Asgardeo
  ├── Authentication
  ├── Self-registration
  └── Roles
```

## User Roles

| Role | Purpose |
|---|---|
| `ADMIN` | Reviews organization applications and job postings |
| `MEMBER_ORGANIZATION` | Posts jobs after organization approval |
| `JOB_SEEKER` | Browses and applies for jobs |

A newly self-registered user may temporarily have no JobBridge role while the organization application is pending.

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
- Post Job navigation shown only to authorized users

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

See [API Reference](docs/api-reference.md) for details.

## Repository Structure

```text
local-job-board/
├── README.md
├── docs/
├── job_board_api/
├── job-board-ui/
└── Ballerina.toml
```

## Local Configuration

The backend uses these Ballerina configurables:

```ballerina
configurable string dbHost = ?;
configurable int dbPort = 3306;
configurable string dbName = ?;
configurable string dbUsername = ?;
configurable string dbPassword = ?;
```

Example local `Config.toml`:

```toml
dbHost = "localhost"
dbPort = 3306
dbName = "jobbridge"
dbUsername = "root"
dbPassword = "replace-with-local-password"
```

Do not commit the real `Config.toml`.

The frontend uses environment-specific values such as:

```env
VITE_API_BASE_URL=http://localhost:9090
VITE_ASGARDEO_CLIENT_ID=replace-me
VITE_ASGARDEO_BASE_URL=https://api.asgardeo.io/t/replace-me
```

Do not commit the real `.env`.

## Local Run

### Backend

Open the integration in WSO2 Integrator and run the `job_board_api` integration.

Default local API URL used during development:

```text
http://localhost:9090/api
```

### Frontend

```bash
cd job-board-ui
npm install
npm run dev
```

Default frontend URL:

```text
http://localhost:5173
```

## Current Limitations

- `GET /api/organizations/me` currently accepts `ownerUserId` from the browser.
- The backend does not yet derive the user identity from a validated access token.
- Some authorization is currently enforced in React rather than fully in the backend.
- Organization approval does not automatically assign the Asgardeo `MEMBER_ORGANIZATION` role.
- Jobs currently store an organization name rather than an `organization_id` foreign key.
- The no-organization case for `/api/organizations/me` may still return `500` instead of `404`.
- Cloud deployment is not complete.
- Bijira API management is planned but not yet configured.

## Next Steps

1. Deploy MySQL and the integration service to Devant.
2. Deploy the React frontend.
3. Update Asgardeo redirect URLs and branding.
4. Secure backend endpoints using validated access tokens and roles.
5. Add Bijira as the consumer-facing API-management layer.
6. Add an `organization_id` relationship to jobs.
7. Automate Asgardeo role assignment after organization approval.
