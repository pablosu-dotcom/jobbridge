# JobBridge

JobBridge is a minimal, purpose-built job board for member organizations and job seekers. It provides public job discovery, organization onboarding, controlled job publishing, administrator review, and AI-assisted job matching.

## Current Status

The MVP is deployed and working with:

- React + Vite web application
- WSO2 Integrator / Ballerina backend integration
- Managed MySQL persistence
- Asgardeo OIDC authentication and self-registration
- Role-aware navigation
- Organization approval and rejection
- Job approval and rejection
- AI job matching through WSO2 AI Gateway and OpenAI
- Project-level UI-to-API connectivity through `/choreo-apis/...`
- Runtime configuration and secrets supplied by the WSO2 Developer Platform
- JobBridge branding in the Asgardeo login experience

A separate WSO2 API Platform/Bijira proxy has also been built and tested with OAuth2 using the built-in STS, policies, throttling, and Developer Portal subscription. It is not currently in the deployed browser-to-backend path.

## Current Deployment Overview

```text
Users
  |
  v
JobBridge React/Vite Web Application
WSO2 Developer Platform
  |
  | /choreo-apis/pablosu-jobbridge/jobboardapi/v1
  v
JobBridge Integration API
WSO2 Integrator / Ballerina
  | \
  |  \ POST /api/ai/match-jobs
  |   \
  |    v
  |  WSO2 AI Gateway 1.2
  |  Google Cloud VM + Nginx/TLS
  |    |
  |    v
  |  App LLM Proxy: jobbridge-ai-prod
  |    |
  |    v
  |  OpenAI (gpt-4o-mini)
  |
  v
Managed MySQL
  +-- jobs
  +-- organizations

Asgardeo
  +-- OIDC authentication
  +-- Self-registration
  +-- User identity
  +-- Application roles
  +-- JobBridge login branding
```

The React application authenticates users directly with Asgardeo. WSO2 Developer Platform Managed Authentication is disabled for the web application to avoid introducing a second authentication layer.

OAuth2 enforcement on the currently deployed JobBridge backend path is disabled for the MVP. API-level OAuth, scopes, and stronger server-side authorization remain hardening items.

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
- Enter a candidate profile and request AI-ranked job matches
- View match percentage and AI-generated reason for each recommended job

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

### AI job matching

The UI sends a short candidate profile to:

```http
POST /api/ai/match-jobs
```

The backend:

1. Calls the reusable `getActiveJobs()` function.
2. Reads active jobs from MySQL.
3. Builds a prompt containing the candidate profile and active jobs.
4. Calls the WSO2 AI Gateway App LLM Proxy.
5. Uses OpenAI `gpt-4o-mini` to rank matches.
6. Returns only matches with score `>= 60`, with at most 5 results.
7. The React app joins each returned `jobId` to its already-loaded jobs state; it does not re-fetch individual jobs.

See [AI Job Matching](docs/ai-job-matching.md).

## API Summary

```http
GET  /api/jobs
POST /api/jobs

POST /api/ai/match-jobs

POST /api/organizations
GET  /api/organizations/me?ownerUserId={userId}

GET /api/admin/jobs/pending
PUT /api/admin/jobs/{id}/approve
PUT /api/admin/jobs/{id}/reject

GET /api/admin/organizations/pending
PUT /api/admin/organizations/{id}/approve
PUT /api/admin/organizations/{id}/reject
```

The deployed web application reaches the backend through:

```text
/choreo-apis/pablosu-jobbridge/jobboardapi/v1
```

Examples:

```text
/choreo-apis/pablosu-jobbridge/jobboardapi/v1/jobs
/choreo-apis/pablosu-jobbridge/jobboardapi/v1/ai/match-jobs
```

See [API Reference](docs/api-reference.md).

## Repository Structure

```text
local-job-board/
├── README.md
├── docs/
│   ├── ai-job-matching.md
│   ├── api-reference.md
│   ├── deployment-guide.md
│   ├── solution-architecture.md
│   └── testing-guide.md
├── job_board_api/
├── job-board-ui/
└── Ballerina.toml
```

The repository is a monorepo. The backend and frontend are imported and deployed as separate WSO2 Developer Platform components.

## Backend Configuration

The backend uses runtime configurables for MySQL and AI Gateway connectivity:

```ballerina
configurable string mysqlUser = ?;
configurable string mysqlHost = ?;
configurable string mysqlPassword = ?;
configurable string mysqlDatabase = ?;
configurable int mysqlPort = ?;

configurable string aiGatewayUrl = ?;
configurable string aiGatewayApiKey = ?;
```

In the deployed environment:

- MySQL values are supplied through platform runtime configuration/secrets.
- `aiGatewayUrl` points to the production App LLM Proxy base URL.
- `aiGatewayApiKey` is stored as a secret.
- Real database or AI Gateway credentials are not stored in GitHub.

Example local configuration:

```toml
mysqlUser = "root"
mysqlHost = "localhost"
mysqlPassword = "replace-with-local-password"
mysqlDatabase = "jobbridge"
mysqlPort = 3306

aiGatewayUrl = "https://localhost:8443/jobbridge/jobbridge-ai-proxy"
aiGatewayApiKey = "replace-with-local-proxy-key"
```

Do not commit a real `Config.toml`.

## Frontend Runtime Configuration

The deployed React application uses:

```text
job-board-ui/public/config.js
```

Example:

```javascript
window.configs = {
  apiUrl: "/choreo-apis/pablosu-jobbridge/jobboardapi/v1"
};
```

The shared frontend configuration distinguishes local Vite development from deployment:

```javascript
export const API_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_API_BASE_URL || "/api"
  : window?.configs?.apiUrl ||
    import.meta.env.VITE_API_BASE_URL ||
    "/api";
```

This means:

```text
Local Vite:
  /api -> Vite proxy -> http://127.0.0.1:9090

Deployed:
  window.configs.apiUrl -> /choreo-apis/... -> deployed backend
```

## Asgardeo Configuration

The React application uses the Asgardeo SPA SDK with Authorization Code + PKCE.

The redirect URL is derived at runtime:

```javascript
const appUrl = window.location.origin;
```

Asgardeo must contain exact matching redirect URLs for local and deployed environments. A trailing `/` mismatch can cause a callback error.

The JobBridge logo is hosted by the web application and referenced by Asgardeo using its public PNG URL.

## Local Run

### MySQL

Start MySQL and create the `jobbridge` database and the `jobs` and `organizations` tables.

### AI Gateway

For local AI matching, run the local WSO2 AI Gateway and deploy the development App LLM Proxy:

```text
https://localhost:8443/jobbridge/jobbridge-ai-proxy
```

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

## API Platform / Bijira Lab Status

A separate `JobBridge Public API` proxy was created in WSO2 API Platform and tested with:

- Built-in API Platform STS
- OAuth2 protection
- Public GET resources and protected write resources
- Rate limiting
- Response-header policy
- Gateway deployment
- Developer Portal publication and subscription

An external Asgardeo key manager was explored, but the deployed JobBridge web application currently continues to use the Developer Platform project connection rather than routing through this API Platform proxy.

## Current Limitations

- API OAuth2 enforcement is disabled on the deployed Developer Platform backend path.
- Backend authorization is not yet the final authority for all role-sensitive operations.
- `GET /api/organizations/me` accepts `ownerUserId` from the browser.
- Organization approval does not automatically assign the Asgardeo `MEMBER_ORGANIZATION` role.
- Jobs currently store an organization name rather than an `organization_id` foreign key.
- API error responses should be standardized.
- AI output is LLM-generated and should be treated as advisory matching rather than a deterministic hiring decision.
- The cloud AI Gateway VM must be running for deployed AI matching to work.

## Next Steps

1. Add AI Gateway guardrails/policies and demonstrate AI observability.
2. Update the solution and deployment architecture diagrams with AI Workspace, the GCP AI Gateway, and OpenAI.
3. Decide whether to move the deployed browser-to-backend path behind the WSO2 API Platform proxy.
4. Complete server-side authentication, roles, ownership checks, and scopes.
5. Automate Asgardeo role assignment after organization approval.
6. Add production-grade backup, monitoring, alerting, auditing, and AI Gateway certificate/VM operational monitoring.

