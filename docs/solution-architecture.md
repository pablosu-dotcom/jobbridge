# JobBridge Solution Architecture

## 1. Purpose

JobBridge is a purpose-built job board connecting job seekers with approved member organizations. The current MVP demonstrates traditional application integration plus an AI-assisted matching flow governed through WSO2 AI Gateway.

The solution demonstrates:

- Enterprise integration
- API-based application design
- Identity and access management
- Approval workflows
- Managed cloud deployment
- AI-assisted job matching
- LLM governance through WSO2 AI Gateway
- Separation of presentation, integration, identity, persistence, API management, and AI runtime concerns

## 2. Business Problem

Member organizations need a simple channel to publish jobs to a shared audience. Job seekers need an easy way to find active opportunities. Administrators need governance over which organizations and job postings become visible.

The AI extension addresses a second problem: even a small list of jobs can be difficult to evaluate quickly. JobBridge lets a job seeker provide a short profile and receives ranked recommendations with explanations based only on currently active jobs.

## 3. Business Requirements

### Job seekers

- Browse active job postings
- Search available jobs
- View job details
- Follow an external application link
- Sign in with Asgardeo
- Describe experience, interests, location, and preferred work
- Receive AI-ranked job recommendations
- Understand why each job was recommended

### Member organizations

- Self-register
- Submit organization details for approval
- View organization application status
- Post jobs after approval
- Submit postings for administrator review

### Administrators

- Review pending organization applications
- Approve or reject organizations
- Review pending job postings
- Approve or reject jobs

## 4. Current Logical Architecture

```text
+--------------------------------+
| Job seekers                    |
| Member organizations           |
| Administrators                 |
+---------------+----------------+
                |
                v
+--------------------------------+
| JobBridge React/Vite UI        |
| - Job search                   |
| - AI job matcher               |
| - Registration                 |
| - Job submission               |
| - Admin review                 |
+---------------+----------------+
                |
                | HTTP/JSON
                v
+--------------------------------+
| JobBridge Integration API      |
| WSO2 Integrator / Ballerina    |
| - Job operations               |
| - Organization operations      |
| - Approval workflows           |
| - Active-job retrieval         |
| - AI orchestration             |
+-----------+--------------------+
            |                |
            |                | OpenAI-compatible API
            v                v
+--------------------+   +--------------------------+
| Managed MySQL      |   | WSO2 AI Gateway         |
| - jobs             |   | App LLM Proxy           |
| - organizations    |   | policies / observability|
+--------------------+   +------------+-------------+
                                     |
                                     v
                                  OpenAI

Asgardeo
  - OIDC authentication
  - Self-registration
  - User identity
  - Roles
```

## 5. Current Deployed Architecture

```text
                             Asgardeo
                        OIDC authentication
                          and user roles
                                |
                                v
+----------------------------------------------------------------+
| WSO2 Developer Platform                                        |
|                                                                |
|  +----------------------------------------------------------+  |
|  | JobBridge React/Vite Web Application                    |  |
|  | - runtime /config.js                                    |  |
|  | - AI Job Matcher UI                                     |  |
|  +-------------------------+--------------------------------+  |
|                            |                                   |
|                            | /choreo-apis/...                   |
|                            v                                   |
|  +----------------------------------------------------------+  |
|  | JobBridge Integration API                               |  |
|  | WSO2 Integrator / Ballerina                             |  |
|  | - getActiveJobs()                                       |  |
|  | - POST /api/ai/match-jobs                               |  |
|  | - runtime configuration / secrets                       |  |
|  +-----------------+----------------------+-----------------+  |
|                    |                      |                    |
+--------------------|----------------------|--------------------+
                     |                      |
                     v                      | HTTPS + X-API-Key
              Managed MySQL                 v
              +--------------+     +-----------------------------+
              | jobs         |     | Google Cloud VM             |
              | organizations|     | Nginx :443                   |
              +--------------+     | WSO2 AI Gateway 1.2         |
                                   | App LLM Proxy:               |
                                   | jobbridge-ai-prod            |
                                   +--------------+--------------+
                                                  |
                                                  v
                                                OpenAI
                                             gpt-4o-mini
```

### AI Workspace control plane

WSO2 AI Workspace is the control plane for the AI Gateway runtime. It manages:

- LLM Provider configuration
- App LLM Proxies
- API keys
- Gateway registration
- Proxy deployment
- AI policies/guardrails
- Usage and observability capabilities

The production AI Gateway runtime itself is self-hosted on a Google Compute Engine VM.

## 6. AI Job Matching Flow

```text
Job seeker profile
       |
       v
React POST /ai/match-jobs
       |
       v
Integrator getActiveJobs()
       |
       +------> Managed MySQL
       |        WHERE status = 'ACTIVE'
       |
       v
Build prompt:
- candidate profile
- active jobs
- output contract
- min score 60
- max 5 matches
       |
       v
WSO2 AI Gateway
jobbridge-ai-prod
       |
       v
OpenAI gpt-4o-mini
       |
       v
Typed response parsing
       |
       v
{
  "matches": [
    {
      "jobId": "...",
      "score": 80,
      "reason": "..."
    }
  ]
}
       |
       v
React joins jobId to existing jobs state
```

The AI service does not create new jobs or alter the database. It ranks only active jobs supplied by JobBridge.

## 7. Component Responsibilities

### React/Vite frontend

- User interface and navigation
- Job search and display
- Forms and role-aware views
- Asgardeo sign-in/sign-out
- Candidate profile input
- Calling `/ai/match-jobs`
- Joining returned `jobId` values to already-loaded jobs
- Rendering match score and explanation

The frontend contains no OpenAI or AI Gateway credentials.

### JobBridge Integration API

- Business workflows
- Request validation
- Persistence and retrieval
- Organization and job lifecycle operations
- Reusable `getActiveJobs()` logic
- AI prompt construction
- Calling WSO2 AI Gateway
- Parsing the OpenAI-compatible response into the JobBridge response contract

Future responsibilities include stronger server-side token validation, role enforcement, and identity-derived ownership checks.

### Managed MySQL

- Organization applications
- Organization lifecycle status
- Job postings
- Job lifecycle status
- Review metadata

AI matching reads active jobs but does not persist AI results.

### Asgardeo

- OIDC authentication
- Self-registration
- User identity
- Application roles
- Login branding

Current roles:

```text
ADMIN
MEMBER_ORGANIZATION
JOB_SEEKER
```

### WSO2 Developer Platform

- Build/deploy Ballerina integration
- Build/deploy React web app
- Runtime configuration and secrets
- Managed MySQL connectivity
- Environment deployment
- Logs
- Project-level component connectivity

### WSO2 AI Workspace

- OpenAI LLM Provider configuration
- AI Gateway registration/control
- App LLM Proxy configuration
- API keys
- AI policies, guardrails, and observability

### WSO2 AI Gateway

- Runtime LLM traffic mediation
- Inbound API key enforcement
- Routing to OpenAI provider
- AI policies/guardrails when configured
- Governed control point between JobBridge and the LLM provider

Production runtime:

```text
Google Compute Engine VM
  -> Nginx public TLS endpoint
  -> WSO2 AI Gateway 1.2
  -> jobbridge-ai-prod
  -> OpenAI
```

### WSO2 API Platform / Bijira

A separate JobBridge API proxy has been implemented and tested with:

- Built-in STS OAuth2
- Resource-level security
- Rate limiting
- Response policies
- Developer Portal publication/subscription

It is currently a governance/security lab path, not the active path used by the deployed React application.

## 8. Organization Lifecycle

```text
No application
      |
      v
Organization submitted
      |
      v
PENDING
  |         |
  v         v
ACTIVE    REJECTED
```

Role assignment remains a separate administrative step after approval.

## 9. Job Lifecycle

```text
Job submitted
      |
      v
PENDING
  |         |
  v         v
ACTIVE    REJECTED
  |
  v
Visible in public search
and eligible for AI matching
```

Only `ACTIVE` jobs are used by public search and AI matching.

## 10. Security Model

### Current deployed state

- Asgardeo authenticates the React SPA.
- React renders role-aware views.
- WSO2 Developer Platform Managed Authentication is disabled for the UI.
- OAuth2 enforcement is disabled on the deployed JobBridge backend path.
- The UI reaches the backend through the Developer Platform project connection.
- `aiGatewayApiKey` is stored as a backend secret and is never sent to the browser.
- The backend calls the production AI Gateway over trusted HTTPS.
- The AI Gateway enforces `X-API-Key` for the App LLM Proxy.

### Target application/API state

- API gateway validates end-user access tokens.
- Backend consumes only trusted identity.
- User ID is derived from `sub`.
- Admin operations require `ADMIN`.
- Job creation requires `MEMBER_ORGANIZATION`.
- Ownership is enforced server-side.
- Scopes complement roles.

Suggested scopes:

```text
jobs:read
jobs:write
organizations:register
admin:review
```

## 11. Key Design Decisions

### Keep LLM credentials out of the browser

React calls only the JobBridge backend. The OpenAI credential remains behind the WSO2 LLM Provider, and the AI Gateway proxy key remains in backend runtime secrets.

### Use AI Gateway rather than direct OpenAI calls

This creates a governed LLM runtime boundary and allows future policies, guardrails, analytics, rate controls, and provider abstraction.

### Reuse active-job retrieval

`getActiveJobs()` is reused by normal job listing logic and AI matching instead of duplicating SQL/business logic.

### Constrain AI output

The prompt requires JSON-only output with `jobId`, `score`, and `reason`, returns at most 5 matches, and filters out scores below 60.

### Self-hosted gateway runtime

The production AI Gateway runs on a dedicated GCP VM while AI Workspace remains the SaaS control plane. Nginx terminates public HTTPS and proxies to the local gateway listener.

### Runtime frontend configuration

Local Vite development uses `/api`; deployment uses `window.configs.apiUrl`.

## 12. Known Architecture Gaps

- API-level end-user OAuth and authorization are not enforced on the deployed backend path.
- Backend authorization should replace frontend-only trust for privileged operations.
- Jobs should reference `organizations.id` through `organization_id`.
- Organization approval should trigger role assignment.
- Backend identity should come from validated tokens rather than browser-supplied ownership data.
- API error responses should be standardized.
- A formal governed OpenAPI contract should be maintained.
- Auditing should record who reviewed each organization and job.
- Production backup, monitoring, alerting, and AI Gateway VM operations should be formalized.
- AI matching is advisory and should not be treated as an automated hiring decision.

