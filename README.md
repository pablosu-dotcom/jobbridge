# JobBridge

JobBridge is a minimal, purpose-built job board for member organizations and job seekers. It provides public job discovery, organization onboarding, controlled job publishing, administrator review, and AI-assisted job matching.

## Current Status

The MVP is deployed and working with:

- React + Vite web application on the WSO2 Developer Platform
- WSO2 Integrator / Ballerina backend integration on Devant
- Managed MySQL persistence
- Asgardeo OIDC authentication and self-registration
- Role-aware navigation and Asgardeo application roles
- Self-hosted WSO2 API Manager 4.7 as the active browser-to-backend API gateway
- OAuth2/JWT validation, reusable scopes, and subscription validation in API Manager
- Moesif analytics for API Manager gateway traffic
- AI job matching through WSO2 AI Gateway and OpenAI
- AI governance with PII masking/redaction, Semantic Prompt Guard, and token-based rate limiting
- Runtime configuration and secrets supplied by the WSO2 Developer Platform
- JobBridge branding in the Asgardeo login experience
- Executable Arazzo workflow for composed job publishing (`publishJob`)
- MCP server generated from the Arazzo workflow and validated through MCP Inspector

The earlier WSO2 API Platform/Bijira proxy remains a useful lab artifact, but the deployed JobBridge web application now routes its API traffic through the self-hosted WSO2 API Manager gateway.

## Current Deployment Overview

```text
Users
  |
  v
JobBridge React/Vite Web Application
WSO2 Developer Platform
  |
  | HTTPS
  | https://35.231.59.214/jobbridge/1.0
  v
Nginx :443
Google Compute Engine - APIM VM
  |
  | HTTPS to localhost:8243
  v
WSO2 API Manager 4.7 Gateway
  |  +-- GET  /jobs                 public
  |  +-- POST /ai/match-jobs        public
  |  +-- POST /jobs                 jobs:write
  |  +-- /organizations/*           organization:manage
  |  +-- /admin/*                   admin
  |
  | OAuth/JWT + scopes + subscriptions
  | Moesif analytics
  v
JobBridge Integration API
WSO2 Integrator / Ballerina on Devant
  | \
  |  \\ POST /ai/match-jobs
  |   \
  |    v
  |  WSO2 AI Gateway 1.2
  |  Google Cloud VM + Nginx/TLS
  |  App LLM Proxy: jobbridge-ai-prod
  |    +-- PII masking/redaction
  |    +-- Semantic Prompt Guard
  |    +-- Token Based Rate Limit
  |    |    2,000 total tokens / 60 sec (demo setting)
  |    v
  |  OpenAI gpt-4o-mini
  |
  v
Managed MySQL
  +-- jobs
  +-- organizations

Asgardeo
  +-- OIDC / Authorization Code + PKCE
  +-- Self-registration
  +-- Application roles
  +-- APIM_GLOBAL_SCOPES
  +-- JWT access tokens
```

The React application authenticates directly with Asgardeo. WSO2 Developer Platform Managed Authentication remains disabled so JobBridge does not introduce a second sign-in layer.

## API Security Model

API Manager is the active ingress/security layer for React traffic.

| Resource | Access |
|---|---|
| `GET /jobs` | Public |
| `POST /ai/match-jobs` | Public |
| `POST /jobs` | OAuth2 + `jobs:write` |
| `POST /organizations` | OAuth2 + `organization:manage` |
| `GET /organizations/me` | OAuth2 + `organization:manage` |
| `/admin/*` | OAuth2 + `admin` |

Protected requests also use API Manager subscription validation. The existing Asgardeo JobBridge SPA client is associated with the subscribed APIM application through out-of-band provisioning.

Asgardeo role-to-scope mapping:

```text
MEMBER_ORGANIZATION
  jobs:write
  organization:manage

ADMIN
  jobs:write
  organization:manage
  admin

JOB_SEEKER
  no protected API scope required for current public job search / AI matching
```

The React SPA requests:

```text
openid profile roles jobs:write organization:manage admin
```

Asgardeo RBAC determines which requested API scopes are actually granted to the signed-in user.

See [Security Framework](docs/security-framework.md) for the consolidated security posture, trust boundaries, controls, verification tests, and remaining hardening work.

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

The browser calls the public APIM operation:

```http
POST https://35.231.59.214/jobbridge/1.0/ai/match-jobs
```

API Manager forwards the request to the JobBridge integration API. The backend then:

1. Calls reusable `getActiveJobs()` and reads active jobs from MySQL.
2. Builds a trusted system message containing JobBridge instructions and the active-job list.
3. Sends the candidate profile separately as the final user message.
4. Calls the WSO2 AI Gateway App LLM Proxy.
5. The AI Gateway applies PII masking/redaction, Semantic Prompt Guard, and token-based rate limiting.
6. Allowed requests are routed to OpenAI `gpt-4o-mini`.
7. Semantic Prompt Guard interventions are preserved as HTTP `422` with a JobBridge-friendly response.
8. Successful matching returns at most five instructed matches with scores of 60 or higher.
9. React joins each returned `jobId` to the already-loaded jobs state.

See [AI Job Matching](docs/ai-job-matching.md).

## API Summary

Backend service resources:

```http
GET  /jobs
POST /jobs
POST /ai/match-jobs

POST /organizations
GET  /organizations/me?ownerUserId={userId}

GET /admin/jobs/pending
PUT /admin/jobs/{id}/approve
PUT /admin/jobs/{id}/reject

GET /admin/organizations/pending
PUT /admin/organizations/{id}/approve
PUT /admin/organizations/{id}/reject
```

Current public APIM base URL:

```text
https://35.231.59.214/jobbridge/1.0
```

Direct Devant target used by API Manager:

```text
https://b48cc93e-fa33-4420-a155-bc653b4d46be-my-env.e1-us-east-azure.choreoapis.dev/pablosu-jobbridge/jobboardapi/v1
```

See [API Reference](docs/api-reference.md).

## OpenAPI Contract

The API contract is generated code-first from the Ballerina service:

```bash
cd job_board_api
bal build --export-openapi
```

Generated contract:

```text
target/openapi/api_openapi.yaml
```

That OpenAPI file is imported into WSO2 API Manager so operations appear individually and can receive resource-specific security scopes.

## Agentic Workflow with Arazzo and MCP

JobBridge now includes an agent-ready workflow that demonstrates how API operations can be composed into a higher-level business capability. The workflow is authored with **Arazzo 1.0.1** and uses the generated JobBridge OpenAPI contract as its source description.

```text
AI / MCP client
      |
      v
MCP tool: publishJob
      |
      v
Arazzo workflow
  1. POST /jobs
       -> 201 Created
       -> capture response.id as jobId
  2. PUT /admin/jobs/{jobId}/approve
       -> 202 Accepted
      |
      v
JobBridge Integration API
      |
      v
Managed MySQL
```

The caller supplies only the business inputs (`title`, `organization`, `location`, `employmentType`, `description`, and `applyUrl`). Arazzo passes the job identifier returned by the create step into the approval step. This is intentionally different from a single-step API wrapper: `publishJob` represents one business outcome composed from multiple API operations.

Current workflow files:

```text
job_board_api/workflows/
├── publish-job.arazzo.yaml
└── api_openapi.yaml
```

The OpenAPI copy under `workflows/` is used by the local Arazzo/MCP lab and is separate from the generated code-first contract under `target/openapi/`. For the Docker-based MCP test, its server URL is set explicitly to:

```yaml
servers:
  - url: "http://host.docker.internal:9090/api"
```

This allows the MCP container to call the JobBridge API running on the macOS host. The explicit URL also avoids a current runner issue observed with the parameterized OpenAPI server URL (`http://{server}:{port}/api`).

The WSO2 Arazzo Visualizer was used to author, visualize, validate, and execute the workflow. The official `wso2/arazzo-mcp-generator` CLI (`arazzo-mcp-gen` v0.1.0) was then used to generate a Dockerized MCP server. The generated MCP tool was invoked successfully with MCP Inspector and created/approved a JobBridge job through the two-step workflow.

The current MCP path is a **local agentic-integration lab**, not the production consumer path. It calls the local JobBridge backend directly and therefore does not yet inherit API Manager OAuth, scopes, subscriptions, or Moesif analytics. A production agent path should route through the governed API layer and use an agent identity with least-privilege authorization.

See [Agentic Workflows](docs/agentic-workflows.md) for setup, commands, workflow design, MCP generation, testing, and known tooling behavior.

## Repository Structure

```text
local-job-board/
├── README.md
├── docs/
│   ├── agentic-workflows.md
│   ├── ai-job-matching.md
│   ├── api-reference.md
│   ├── deployment-guide.md
│   ├── guardrails-summary.md
│   ├── security-framework.md
│   ├── solution-architecture.md
│   └── testing-guide.md
├── job_board_api/
│   └── workflows/
│       ├── publish-job.arazzo.yaml
│       └── api_openapi.yaml
├── job-board-ui/
└── Ballerina.toml
```

The repository is a monorepo. The backend and frontend are deployed as separate WSO2 Developer Platform components.

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
- `aiGatewayApiKey` is stored as a backend secret.
- Real database, OpenAI, Asgardeo management-app, Moesif, or AI Gateway secrets are not stored in GitHub.

## Frontend Runtime Configuration

The deployed React application uses a runtime `config.js` file mount. The deployed value must point to the APIM gateway:

```javascript
window.configs = {
  apiUrl: "https://35.231.59.214/jobbridge/1.0"
};
```

All deployed backend traffic, including `/ai/match-jobs`, uses this single `apiUrl`.

Local Vite development continues to use `/api` and the local proxy to `127.0.0.1:9090`.

Important: updating `job-board-ui/public/config.js` in GitHub does not by itself replace an environment-specific runtime file mount. Update the deployed `config.js` file mount and redeploy when the production API URL changes.

## Asgardeo Configuration

The JobBridge React application uses Authorization Code + PKCE.

API Manager synchronizes reusable scopes into the Asgardeo API resource:

```text
Display name: APIM_GLOBAL_SCOPES
Identifier:   /api/server/v1/scope-resource
```

Current scopes:

```text
jobs:write
organization:manage
admin
```

A separate Asgardeo `API-Management-App` is used by the APIM Asgardeo Key Manager connector for management API calls. It is not the browser SPA.

## API Manager and Analytics

The self-hosted API Manager 4.7 deployment uses:

- Asgardeo external Key Manager
- Direct Token invocation
- JWT self-validation through Asgardeo JWKS
- Out-of-band OAuth client provisioning for the existing JobBridge SPA
- Developer Portal application/subscription validation
- Nginx public HTTPS on port 443
- Moesif analytics

Moesif must use the **Collector Application ID** as `moesifKey`; a Moesif management/API key will not ingest gateway events.

## Current Limitations / Hardening

- The Devant backend target is still a separately reachable endpoint; production hardening should prevent bypassing APIM or add defense-in-depth backend authentication.
- `GET /organizations/me` still accepts `ownerUserId` from the browser; identity should eventually be derived server-side from the validated token.
- Organization approval does not automatically assign `MEMBER_ORGANIZATION` in Asgardeo.
- Jobs currently store an organization name rather than a normalized `organization_id` foreign key.
- AI matching is intentionally public at APIM; downstream AI Gateway token-rate controls mitigate demo abuse, but production abuse controls should be reviewed.
- AI output is advisory and should not be treated as an automated hiring decision.
- Both GCP gateway VMs must be operational for their respective runtime paths.
- The current local MCP workflow calls the backend directly and does not yet use APIM OAuth/scopes or an independently governed agent identity.
- The current Arazzo/MCP runner required an explicit OpenAPI server URL for Docker-to-host execution; the parameterized server URL worked in the VS Code visualizer but returned `404` through the generated MCP runtime.

## Next Steps

1. Restrict direct backend access so APIM is the only supported consumer ingress path.
2. Derive organization ownership from validated token identity rather than browser-supplied user IDs.
3. Automate Asgardeo role assignment after organization approval.
4. Tune AI quotas using observed usage.
5. Add production backups, monitoring, alerting, and auditing.
6. Automate and monitor short-lived Let's Encrypt IP certificate renewal on the gateway VMs.
7. Connect an AI agent/client to the MCP `publishJob` tool and demonstrate natural-language tool selection.
8. Move the agent execution path behind API Manager and apply agent-specific identity, scopes, subscription/governance, and auditing.
