# JobBridge Solution Architecture

## 1. Purpose

JobBridge is a purpose-built job board connecting job seekers with approved member organizations. The current MVP combines traditional application integration, identity-aware API security, API management, and AI-assisted job matching governed through WSO2 AI Gateway.

The solution demonstrates:

- Enterprise integration
- API-based application design
- OIDC/OAuth2 identity and access management
- Resource-level scopes and subscription validation
- Approval workflows
- Managed cloud deployment
- API analytics
- AI-assisted job matching
- LLM governance through WSO2 AI Gateway
- Separation of presentation, API management, integration, identity, persistence, and AI runtime concerns
- Agentic API composition using Arazzo workflows and MCP tooling

## 2. Business Problem

Member organizations need a simple channel to publish jobs to a shared audience. Job seekers need an easy way to find active opportunities. Administrators need governance over which organizations and job postings become visible.

The AI extension addresses an additional discovery problem: a job seeker can provide a short profile and receive ranked recommendations with explanations based only on currently active JobBridge jobs.

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

## 4. Logical Architecture

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
                | HTTPS / JSON
                v
+--------------------------------+
| API Management Layer           |
| - OAuth/JWT validation         |
| - scopes                       |
| - subscriptions                |
| - analytics                    |
+---------------+----------------+
                |
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
| - jobs             |   | policies / observability|
| - organizations    |   +------------+-------------+
+--------------------+                |
                                      v
                                   OpenAI

Asgardeo
  - OIDC / PKCE
  - user identity
  - application roles
  - API scopes
  - JWT access tokens
```

## 5. Current Deployed Architecture

```text
                              Asgardeo
                    OIDC + RBAC + access tokens
                                |
                                v
+---------------------------------------------------------------+
| WSO2 Developer Platform                                       |
|                                                               |
|  +---------------------------------------------------------+  |
|  | JobBridge React/Vite Web Application                   |  |
|  | runtime config.js -> APIM public base URL              |  |
|  +------------------------+--------------------------------+  |
+---------------------------|-----------------------------------+
                            |
                            | HTTPS :443
                            v
+---------------------------------------------------------------+
| Google Compute Engine - APIM VM                               |
|                                                               |
| Nginx + Let's Encrypt IP certificate                          |
|            |                                                  |
|            | HTTPS localhost:8243                             |
|            v                                                  |
| WSO2 API Manager 4.7 Gateway                                  |
| - GET /jobs                         public                    |
| - POST /ai/match-jobs              public                    |
| - POST /jobs                       jobs:write                 |
| - /organizations/*                 organization:manage        |
| - /admin/*                         admin                      |
| - subscription validation                                     |
| - Asgardeo external Key Manager                              |
| - Moesif analytics                                            |
+---------------------------+-----------------------------------+
                            |
                            | HTTPS
                            v
+---------------------------------------------------------------+
| WSO2 Developer Platform / Devant                              |
| JobBridge Integration API - WSO2 Integrator / Ballerina       |
| - business workflows                                          |
| - MySQL access                                                |
| - AI orchestration                                            |
+----------------------+-------------------------+--------------+
                       |                         |
                       v                         | HTTPS + X-API-Key
                Managed MySQL                    v
                +-------------+     +-----------------------------+
                | jobs        |     | GCP AI Gateway VM           |
                | organizations|    | Nginx :443                   |
                +-------------+     | WSO2 AI Gateway 1.2         |
                                    | jobbridge-ai-prod            |
                                    | - PII masking/redaction      |
                                    | - Semantic Prompt Guard      |
                                    | - Token rate limit           |
                                    +--------------+--------------+
                                                   |
                                                   v
                                                OpenAI
                                             gpt-4o-mini
```

### WSO2 AI Workspace control plane

AI Workspace remains the control plane for the self-hosted AI Gateway runtime. It manages the LLM Provider, App LLM Proxy, API key, gateway registration, proxy deployment, AI policies/guardrails, and available insights. Runtime LLM traffic flows through the self-hosted AI Gateway, not through the control-plane UI.

### API Manager control plane

API Publisher/Admin/DevPortal run on the APIM VM and are accessed through an SSH tunnel to management port `9443`. Public consumer traffic enters through Nginx on `443`; ports `8243` and `9443` are not intentionally exposed to the Internet.

## 6. Agentic Workflow / MCP Lab

JobBridge now includes a local agentic-integration lab that demonstrates how API operations can be composed into a business-level capability and exposed as an MCP tool. This path is additive to the deployed browser architecture; it does not replace the React/APIM runtime path.

```text
AI / MCP client
(MCP Inspector today; AI agent client next)
        |
        | MCP over Streamable HTTP
        v
+-----------------------------------------------+
| Generated JobBridge MCP Server               |
| Docker container                             |
| host port 5001 -> container port 5000        |
| Tool: publishJob                             |
+----------------------+------------------------+
                       |
                       | executes Arazzo
                       v
+-----------------------------------------------+
| Arazzo 1.0.1 workflow                        |
| publishJob                                    |
|                                               |
| 1. createJob                                  |
|    operationId: postJobs                      |
|    POST /jobs                                 |
|    output: jobId <- $response.body#/id        |
|                                               |
| 2. approveJob                                 |
|    operationId: putAdminJobsIdApprove         |
|    PUT /admin/jobs/{jobId}/approve            |
+----------------------+------------------------+
                       |
                       | http://host.docker.internal:9090/api
                       v
              JobBridge Integration API
                       |
                       v
                  Managed MySQL
```

### Authoring and generation

- **WSO2 Arazzo Visualizer for VS Code**: authoring, visualization, validation, and `Try with curl` execution.
- **Arazzo version**: `1.0.1`, matching the current visualizer/LSP support used in the lab.
- **OpenAPI source**: generated from Ballerina and copied into `job_board_api/workflows/api_openapi.yaml` for the local workflow/MCP package.
- **WSO2 Arazzo MCP Generator**: official `wso2/arazzo-mcp-generator`, CLI `arazzo-mcp-gen` v0.1.0.
- **MCP test client**: MCP Inspector.

### Why Arazzo is used here

A single-step Arazzo definition can resemble an API tool wrapper. The `publishJob` workflow demonstrates the stronger use case: one business outcome is composed from multiple operations, and data produced by one step becomes input to the next. The caller does not need to know the generated job identifier or manually orchestrate the approval request.

### Current lab boundary

The MCP container currently calls the locally running Ballerina API directly. Therefore this lab path bypasses the deployed API Manager gateway and does not yet exercise APIM OAuth, reusable scopes, subscription validation, or Moesif analytics. The production target is to place the agent path behind the governed API layer and represent the AI agent as a first-class identity with least-privilege authorization and auditable actions.

### OpenAPI server behavior observed

The generated Ballerina contract uses a parameterized server URL:

```yaml
servers:
  - url: "http://{server}:{port}/api"
```

That form worked in the VS Code Arazzo Visualizer. In the generated Docker MCP runtime it produced `404` responses even though direct container-to-host GET/POST calls succeeded. The workflow-specific OpenAPI copy therefore uses:

```yaml
servers:
  - url: "http://host.docker.internal:9090/api"
```

This is treated as a local tooling/runtime workaround, not a change to the code-first Ballerina OpenAPI source.

## 7. API Security and Authorization Flow

```text
React SPA
   |
   | Authorization Code + PKCE
   v
Asgardeo
   |
   | access token (JWT)
   | scopes derived from application role permissions
   v
React protected request
   |
   | Authorization: Bearer <JWT>
   v
WSO2 API Manager
   |
   +--> validate JWT signature / issuer via Asgardeo Key Manager
   +--> associate azp/client ID with subscribed APIM application
   +--> validate API subscription
   +--> validate required resource scope
   |
   v
JobBridge Integration API
```

Resource model:

```text
GET  /jobs
  public

POST /ai/match-jobs
  public

POST /jobs
  jobs:write

POST /organizations
GET  /organizations/me
  organization:manage

/admin/*
  admin
```

Asgardeo role permissions:

```text
MEMBER_ORGANIZATION
  jobs:write
  organization:manage

ADMIN
  jobs:write
  organization:manage
  admin
```

Scopes are synchronized by APIM into:

```text
APIM_GLOBAL_SCOPES
Identifier: /api/server/v1/scope-resource
```

The JobBridge SPA is authorized for the synchronized scopes. RBAC determines which scopes are actually granted to each user.

## 8. Subscription Model

The JobBridge API remains subscription-enabled in API Manager.

```text
Asgardeo JobBridge SPA client ID
        |
        | Out-of-Band provisioning
        v
APIM Developer Portal application: JobBridge
        |
        | subscription
        v
JobBridge API 1.0
```

The browser SPA is a public PKCE client and therefore has no client secret. APIM uses out-of-band client mapping with the existing Asgardeo client ID rather than creating a second browser OAuth application.

## 9. AI Job Matching Flow

```text
Job seeker profile
       |
       v
React POST /ai/match-jobs
       |
       | public APIM operation
       v
WSO2 API Manager
       |
       | analytics / ingress governance
       v
JobBridge Integration API
       |
       +------> getActiveJobs() --> Managed MySQL
       |                         WHERE status = 'ACTIVE'
       |
       v
Build LLM request
- SYSTEM: JobBridge instructions + active jobs + output contract
- USER: candidate profile only
       |
       v
WSO2 AI Gateway / jobbridge-ai-prod
- PII masking/redaction
- Semantic Prompt Guard on $.messages[-1].content
- Token Based Rate Limit: 2,000 total tokens / 60 sec
       |
       +-- semantic intervention -> 422
       +-- token quota exhausted -> 429
       |
       v
OpenAI gpt-4o-mini
       |
       v
Typed response parsing
       |
       v
React joins jobId to existing jobs state
```

The AI service does not create new jobs or alter the database. It ranks only active jobs supplied by JobBridge.

## 10. Component Responsibilities

### React/Vite frontend

- User interface and navigation
- Job search and display
- Forms and role-aware views
- Asgardeo sign-in/sign-out
- Requesting JobBridge API scopes
- Sending bearer tokens only on protected calls
- Candidate profile input
- Calling `/ai/match-jobs` through APIM
- Joining returned `jobId` values to already-loaded jobs

The frontend contains no OpenAI, AI Gateway, Asgardeo management-app, or Moesif credentials.

### WSO2 API Manager 4.7

- Active browser/API ingress
- OpenAPI-based API definition
- Asgardeo external Key Manager integration
- JWT validation
- Resource-level scope enforcement
- Subscription validation
- Out-of-band mapping of the existing SPA client
- Developer Portal subscription
- Moesif analytics publishing

### JobBridge Integration API

- Business workflows
- Request validation
- Persistence and retrieval
- Organization and job lifecycle operations
- Reusable `getActiveJobs()` logic
- AI prompt construction
- Calling WSO2 AI Gateway
- Parsing the OpenAI-compatible response into the JobBridge response contract

### Managed MySQL

- Organization applications
- Organization lifecycle status
- Job postings
- Job lifecycle status

AI matching reads active jobs but does not persist AI results.

### Asgardeo

- OIDC authentication
- Self-registration
- Authorization Code + PKCE
- User identity
- Application roles
- API permissions/scopes
- JWT access tokens
- Login branding

### WSO2 AI Gateway

- Runtime LLM traffic mediation
- Inbound App LLM Proxy API key enforcement
- Routing to the OpenAI provider
- PII masking/redaction
- Semantic Prompt Guard
- Token-based rate limiting
- AI-specific runtime governance

### Arazzo / MCP agentic workflow

- Defines the composed `publishJob` business capability
- Reuses OpenAPI `operationId` values instead of duplicating API semantics
- Passes the created job identifier from `postJobs` into `putAdminJobsIdApprove`
- Is exposed as an MCP tool by the generated local MCP server
- Currently operates as a local lab path; production governance remains a next step

### Moesif

- API Manager request analytics
- Request counts, status codes, latency, application/API/resource visibility
- Confirmation that traffic is traversing the APIM gateway

Only traffic that actually passes through API Manager appears in this analytics path.

## 11. Organization Lifecycle

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

## 12. Job Lifecycle

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

## 13. Key Design Decisions

### One API ingress path from React

All deployed React-to-backend traffic now uses the APIM gateway. The prior `/choreo-apis/...` project connection is no longer the intended browser API route.

### Separate API management from AI governance

API Manager handles application/API concerns: OAuth, scopes, subscriptions, routing, and API analytics. AI Gateway handles LLM concerns: provider routing, PII controls, semantic prompt protection, token quotas, and AI observability.

### Keep LLM credentials out of the browser

React calls only JobBridge APIs. The OpenAI credential remains behind the WSO2 LLM Provider, and the App LLM Proxy key remains in backend runtime secrets.

### Code-first OpenAPI contract

The Ballerina service is the source for the API contract:

```bash
bal build --export-openapi
```

The generated `target/openapi/api_openapi.yaml` is imported into API Manager so explicit operations can receive resource-specific scopes.

### Reusable scopes

The design intentionally uses reusable scopes (`jobs:write`, `organization:manage`, `admin`) rather than a unique scope per operation.

### Public AI matching with downstream AI control

`POST /ai/match-jobs` is public at API Manager, matching the public job-search experience. The expensive downstream LLM call remains protected by the AI Gateway App LLM Proxy and its token-rate policy.

## 14. Known Architecture Gaps

- The direct Devant backend endpoint can still be a bypass path unless restricted or protected independently.
- `GET /organizations/me` should ultimately derive identity from the validated token rather than browser-supplied ownership data.
- Organization approval should trigger Asgardeo role assignment automatically.
- Jobs should reference `organizations.id` through a normalized foreign key.
- Public AI matching should be reviewed for abuse controls beyond the current downstream token quota before production use.
- Certificate renewal/VM uptime for both gateway VMs should be monitored.
- Auditing should record who reviewed each organization and job.
- AI matching is advisory and should not be treated as an automated hiring decision.
- The local MCP path currently bypasses APIM and therefore does not yet enforce agent-specific OAuth scopes, subscriptions, or centralized API analytics.
- The generated MCP runner required an explicit Docker-to-host OpenAPI server URL in the current lab; parameterized server variables should be retested as the tooling evolves.
