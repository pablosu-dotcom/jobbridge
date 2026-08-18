# JobBridge Security Framework

## 1. Purpose

This document describes the current JobBridge security posture, the controls already implemented, the trust boundaries between components, and the remaining hardening work.

The goal is to make security responsibilities explicit across:

- the React browser application
- Asgardeo identity and authorization
- WSO2 API Manager
- the JobBridge Integration API on Devant
- managed MySQL
- WSO2 AI Gateway
- OpenAI / WSO2 LLM Provider
- Google Cloud networking and TLS
- operational observability and secrets management

This is an implementation-oriented security framework for the JobBridge MVP. It is not a claim of full production security certification.

## 2. Security Principles

JobBridge currently follows these principles:

1. **Single governed API ingress for browser traffic**  
   The deployed React application routes all JobBridge backend traffic through WSO2 API Manager.

2. **Externalized identity**  
   User authentication, application roles, and API scope grants are managed in Asgardeo rather than implemented in React or Ballerina.

3. **Least privilege at the API resource level**  
   Protected resources require explicit scopes. Public resources are deliberately marked public rather than relying on absence of a token.

4. **Application entitlement as well as user authorization**  
   Protected API calls require both a valid scoped token and a valid APIM application subscription.

5. **No browser-side service secrets**  
   Database credentials, AI Gateway keys, OpenAI credentials, Asgardeo management credentials, and Moesif credentials remain server-side.

6. **Layered AI controls**  
   JobBridge routes LLM traffic through WSO2 AI Gateway, where AI-specific policies are enforced independently of normal API authorization.

7. **Trusted TLS for public runtime traffic**  
   Browser-facing gateway traffic uses HTTPS with a publicly trusted certificate.

8. **Observability at security control points**  
   APIM traffic is observable in Moesif, while platform, gateway, Nginx, and AI runtime logs are available for troubleshooting and audit support.

## 3. Current Security Architecture

```text
                              Asgardeo
                     Authentication + RBAC
                     OAuth2/OIDC + JWT scopes
                                |
                                v
+----------------------------------------------------------+
| JobBridge React SPA                                      |
| WSO2 Developer Platform                                  |
|                                                          |
| Authorization Code + PKCE                                |
| Runtime API URL -> https://35.231.59.214/jobbridge/1.0  |
+----------------------------+-----------------------------+
                             |
                             | HTTPS :443
                             v
+----------------------------------------------------------+
| APIM Google Compute Engine VM                            |
|                                                          |
| Nginx                                                    |
| - public TLS termination                                 |
| - Let's Encrypt IP certificate                          |
|                                                          |
| WSO2 API Manager 4.7 Gateway                             |
| - Asgardeo external Key Manager                         |
| - JWT validation                                         |
| - scope validation                                       |
| - subscription validation                                |
| - public/protected resource policy                       |
| - Moesif analytics                                       |
+----------------------------+-----------------------------+
                             |
                             | HTTPS
                             v
+----------------------------------------------------------+
| JobBridge Integration API                                |
| WSO2 Integrator / Ballerina on Devant                    |
| - business workflows                                     |
| - database access                                        |
| - AI orchestration                                       |
+----------------------+------------------+----------------+
                       |                  |
                       v                  | HTTPS + X-API-Key
                Managed MySQL             v
                                  +--------------------------+
                                  | WSO2 AI Gateway 1.2     |
                                  | - PII masking           |
                                  | - Semantic Prompt Guard |
                                  | - token rate limit      |
                                  +------------+-------------+
                                               |
                                               v
                                            OpenAI
```

## 4. Trust Boundaries

### 4.1 Browser to Asgardeo

The React SPA is a public OAuth client and uses **Authorization Code + PKCE**.

The SPA has a Client ID but no client secret. A browser-delivered secret would not be confidential and is therefore not part of the SPA security model.

Asgardeo is responsible for:

- user authentication
- self-registration
- application roles
- role-to-permission mapping
- OAuth authorization
- access-token issuance
- JWT scope claims

### 4.2 Browser to API Manager

All deployed JobBridge API requests use:

```text
https://35.231.59.214/jobbridge/1.0
```

API Manager is the primary API security enforcement point for browser traffic.

Protected requests carry:

```http
Authorization: Bearer <Asgardeo access token>
```

Public operations deliberately omit the bearer token.

### 4.3 API Manager to Devant

API Manager proxies requests to the deployed JobBridge Integration API on Devant.

The Devant service remains separately reachable today. Therefore, APIM is the **supported consumer ingress**, but direct backend bypass remains a known hardening gap until direct access is restricted or the backend independently validates identity.

### 4.4 Devant to AI Gateway

The browser never calls the App LLM Proxy directly.

The JobBridge backend calls the production AI Gateway using:

```http
X-API-Key: <server-side App LLM Proxy key>
```

This key is stored as a backend runtime secret and is never sent to React.

### 4.5 AI Gateway to OpenAI

The OpenAI provider credential is held behind the WSO2 LLM Provider / AI Workspace configuration. The JobBridge browser and backend do not store the upstream model credential.

## 5. Authentication

### 5.1 End-user authentication

Asgardeo authenticates JobBridge users.

The React SPA uses:

```text
OAuth 2.0 Authorization Code
+ PKCE
+ OIDC
```

Common requested identity scopes:

```text
openid
profile
roles
```

The SPA also requests the JobBridge API scopes. Asgardeo RBAC determines which requested scopes are actually issued to the signed-in user.

### 5.2 API Manager Key Manager integration

WSO2 API Manager uses Asgardeo as an external Key Manager.

Current integration model:

```text
API Invocation Method: Direct Token
Token Validation:       Self validate JWT
Out-of-Band Provisioning: enabled
```

A separate Asgardeo application named `API-Management-App` is used by the APIM connector for Asgardeo management API calls. Its credentials are distinct from the JobBridge SPA client.

The connector uses the shared Asgardeo API resource:

```text
Display Name: APIM_GLOBAL_SCOPES
Identifier:   /api/server/v1/scope-resource
```

APIM-created scopes are synchronized into that resource.

## 6. Authorization Model

JobBridge uses both **roles** and **OAuth scopes**.

Roles describe a user's business persona. Scopes describe the API permissions granted to that persona.

### 6.1 Roles

```text
ADMIN
MEMBER_ORGANIZATION
JOB_SEEKER
```

### 6.2 Scopes

```text
jobs:write
organization:manage
admin
```

### 6.3 Role-to-scope mapping

```text
MEMBER_ORGANIZATION
  jobs:write
  organization:manage

ADMIN
  jobs:write
  organization:manage
  admin

JOB_SEEKER
  no protected API scope required for the current public flows
```

If the `APIM_GLOBAL_SCOPES` API resource or its permissions are deleted and recreated, the Asgardeo role-permission assignments must be verified again because role mappings can be removed with the old permission objects.

## 7. API Resource Security

Current resource policy:

| Resource | Authentication | Required scope | Subscription validation |
|---|---|---|---|
| `GET /jobs` | Public | None | Not applicable to anonymous request |
| `POST /ai/match-jobs` | Public | None | Not applicable to anonymous request |
| `POST /jobs` | OAuth2/JWT | `jobs:write` | Yes |
| `POST /organizations` | OAuth2/JWT | `organization:manage` | Yes |
| `GET /organizations/me` | OAuth2/JWT | `organization:manage` | Yes |
| `GET /admin/jobs/pending` | OAuth2/JWT | `admin` | Yes |
| `PUT /admin/jobs/{id}/approve` | OAuth2/JWT | `admin` | Yes |
| `PUT /admin/jobs/{id}/reject` | OAuth2/JWT | `admin` | Yes |
| `GET /admin/organizations/pending` | OAuth2/JWT | `admin` | Yes |
| `PUT /admin/organizations/{id}/approve` | OAuth2/JWT | `admin` | Yes |
| `PUT /admin/organizations/{id}/reject` | OAuth2/JWT | `admin` | Yes |

### Public-resource rationale

`GET /jobs` is intentionally public because job discovery is part of the public user experience.

`POST /ai/match-jobs` is also intentionally public in the current MVP. The API Manager resource has security disabled, while downstream AI usage is constrained by the AI Gateway token-rate policy and AI guardrails.

For production use, anonymous AI abuse controls should be reviewed independently of the MVP decision.

## 8. Subscription Security

The JobBridge API remains subscription-enabled in WSO2 API Manager.

For protected operations, authorization therefore checks both:

```text
Is this client application subscribed to the API?
AND
Does the access token contain the required resource scope?
```

The existing Asgardeo JobBridge SPA is associated with the APIM `JobBridge` application through **Out-of-Band provisioning**.

Because the SPA is a PKCE public client, APIM is configured to accept the existing Consumer Key / Client ID without requiring a browser client secret.

The APIM key-manager configuration includes:

```toml
[apim.key_manager]
enable_provisioned_app_validation = false
```

This disables provisioning-time validation of the externally created OAuth client. It does **not** disable API subscription validation at runtime.

## 9. Token Validation

Protected API calls use Asgardeo JWT access tokens.

API Manager validates the token using the external Asgardeo Key Manager configuration and JWKS.

The effective authorization sequence is:

```text
Request arrives at APIM
  |
  +--> Is an access token present?
  |
  +--> Is the JWT valid and trusted?
  |
  +--> Does azp/client ID map to the APIM application?
  |
  +--> Is that application subscribed to JobBridge API?
  |
  +--> Does the token contain the resource scope?
  |
  v
Forward to JobBridge backend
```

Expected failures:

```text
401 -> missing or invalid authentication
403 -> valid identity/application but insufficient scope or entitlement
```

## 10. Network Security

### 10.1 APIM VM

The APIM runtime uses a reserved static Google Cloud external IPv4 address.

Public consumer ingress:

```text
TCP 443 -> Nginx
```

HTTP `80` is available for certificate validation / redirect behavior as configured.

The following APIM ports are intentionally not exposed as normal public consumer endpoints:

```text
8243  API Manager HTTPS gateway listener
9443  Publisher / Admin / DevPortal management
```

Management access to `9443` is performed through an SSH local port-forward when required.

### 10.2 Nginx to APIM

Nginx terminates publicly trusted TLS and proxies internally to:

```text
https://127.0.0.1:8243
```

The local APIM listener currently presents the WSO2 local/self-signed certificate, so the Nginx upstream configuration disables certificate verification for this loopback-only hop.

This exception applies only to the same-VM internal proxy connection. Public clients receive trusted TLS from Nginx.

### 10.3 AI Gateway VM

The production AI Gateway runs on a separate GCP VM behind its own Nginx HTTPS ingress. Internal/admin gateway ports remain private.

## 11. TLS and Certificate Management

The APIM public endpoint uses a Let's Encrypt certificate issued directly for the static IP address.

Current certificate automation uses Certbot 5.7.x and a short-lived IP certificate profile.

The certificate files are referenced by Nginx under:

```text
/etc/letsencrypt/live/<public-ip>/fullchain.pem
/etc/letsencrypt/live/<public-ip>/privkey.pem
```

A Certbot deploy hook reloads Nginx after successful certificate renewal.

Operational requirement:

- certificate renewal must remain automated
- renewal failures must be monitored
- Nginx must reload after renewal

## 12. Secrets and Credential Handling

The following values must not be committed to GitHub:

| Secret | Storage / owner |
|---|---|
| Managed MySQL password | Developer Platform runtime secret/configuration |
| AI Gateway App LLM Proxy API key | `job_board_api` runtime secret |
| OpenAI model provider key | WSO2 LLM Provider / AI Workspace |
| AI Gateway embedding provider key | AI Gateway runtime configuration |
| Asgardeo API-Management-App client secret | APIM Key Manager configuration / operational secret store |
| Moesif Collector Application ID | APIM runtime configuration; treat as operational secret |
| Local development secrets | local `Config.toml` / `.env`, excluded from Git |

The React application contains no database, OpenAI, AI Gateway, or Asgardeo management secret.

## 13. AI Security Controls

AI matching uses a separate security layer because normal OAuth authorization does not address LLM-specific risks.

Current AI Gateway controls:

### PII masking / redaction

Candidate-supplied PII can be masked before the request reaches the upstream model.

### Semantic Prompt Guard

The gateway evaluates the final user message using a semantic deny-list strategy.

Recognized denied/off-topic requests can be stopped before model invocation and returned as HTTP `422`.

### System-prompt fallback

The backend separately instructs the model not to perform unrelated tasks and to return an empty match array for off-topic input that is not blocked by the semantic guard.

### Token-based rate limiting

Current demo quota:

```text
2,000 total tokens / 60 seconds
```

This controls aggregate prompt + completion token consumption and can return HTTP `429` when the quota is exhausted.

### Credential boundary

```text
React
  -> no AI provider credentials

JobBridge backend
  -> App LLM Proxy X-API-Key only

AI Gateway / AI Workspace
  -> provider and policy configuration
```

## 14. Data Security

Managed MySQL stores:

```text
jobs
organizations
```

Database credentials are supplied at runtime rather than committed to source control.

Current data-security hardening items include:

- derive organization ownership from validated token identity rather than trusting browser-supplied `ownerUserId`
- normalize jobs to an organization foreign key where appropriate
- formalize backups and restore testing
- define retention requirements
- add audit records for privileged approval/rejection actions

AI match results are advisory and are not currently persisted as hiring decisions.

## 15. Observability and Security Monitoring

### API Manager / Moesif

APIM publishes gateway analytics to Moesif.

Moesif is used to confirm that browser traffic actually traverses the governed APIM ingress and to inspect request activity, status codes, latency, API usage, and application traffic.

Important implementation detail:

```text
moesifKey = Moesif Collector Application ID
```

Using a different Moesif management/API key may allow the reporter to initialize while failing to produce the expected event ingestion.

### APIM logs

Useful APIM runtime log:

```text
repository/logs/wso2carbon.log
```

This is used for:

- Key Manager connector errors
- Asgardeo API-resource synchronization failures
- analytics initialization/errors
- other APIM runtime failures

### Nginx

Nginx access/error logs provide public ingress visibility for both APIM and AI Gateway VMs.

### Developer Platform

Use application/runtime logs for:

- Ballerina errors
- database errors
- downstream AI call failures

### AI Gateway

Use AI Gateway runtime/container logs and AI Workspace insights where available for AI policy and LLM traffic troubleshooting.

## 16. Security Verification Tests

Minimum security smoke tests:

### Public job search

```bash
curl -i https://35.231.59.214/jobbridge/1.0/jobs
```

Expected:

```text
200 without Authorization header
```

### Protected operation without token

```text
POST /jobs
```

Expected:

```text
401
```

### Member scope success

Use a `MEMBER_ORGANIZATION` token containing:

```text
jobs:write
organization:manage
```

Call:

```text
POST /jobs
```

Expected: success.

### Member denied from admin resource

Call:

```text
GET /admin/jobs/pending
```

with a member token lacking `admin`.

Expected:

```text
403
```

### Admin success

Repeat the same admin request with an `ADMIN` token containing `admin`.

Expected:

```text
200
```

### Browser ingress verification

In browser DevTools, confirm the deployed React application calls:

```text
https://35.231.59.214/jobbridge/1.0/...
```

and not the previous:

```text
/choreo-apis/pablosu-jobbridge/jobboardapi/v1/...
```

Then verify the browser requests appear in Moesif.

## 17. Current Security Posture

### Implemented

- [x] Asgardeo authentication
- [x] Authorization Code + PKCE for SPA
- [x] Asgardeo application roles
- [x] APIM external Asgardeo Key Manager
- [x] JWT access-token validation at APIM
- [x] Reusable API scopes
- [x] Role-to-scope mapping
- [x] Resource-level OAuth enforcement
- [x] Deliberate public-resource configuration
- [x] APIM application subscription validation
- [x] OOB mapping of existing SPA client to APIM application
- [x] Single APIM ingress used by deployed React API traffic
- [x] Public HTTPS via Nginx
- [x] Reserved static APIM public IP
- [x] Trusted Let's Encrypt public certificate
- [x] Automated certificate renewal hook
- [x] Moesif APIM analytics
- [x] AI Gateway API-key enforcement
- [x] PII masking/redaction
- [x] Semantic Prompt Guard
- [x] AI token-based rate limit
- [x] AI/model credentials kept out of browser
- [x] Database credentials kept out of source control

### Remaining hardening

- [ ] Prevent direct bypass of APIM to the Devant backend, or add backend defense-in-depth token validation
- [ ] Derive user/organization ownership from validated identity claims
- [ ] Automate `MEMBER_ORGANIZATION` role assignment after organization approval
- [ ] Review anonymous abuse controls for public `/ai/match-jobs`
- [ ] Add formal audit logging for privileged actions
- [ ] Add production backup/restore procedures
- [ ] Add operational alerting for APIM, AI Gateway, certificate renewal, and backend health
- [ ] Standardize security/error response bodies
- [ ] Define production secret rotation procedures
- [ ] Define formal data-retention and privacy requirements

## 18. Security Posture Summary

The current JobBridge MVP has moved beyond frontend-only role awareness to a governed API security model.

The primary browser security boundary is now WSO2 API Manager, which validates Asgardeo JWTs, enforces resource scopes, and checks application subscriptions. Asgardeo remains the identity and authorization source. Devant hosts business logic and data access, while WSO2 AI Gateway independently governs LLM traffic.

The most important remaining architectural security gap is the separately reachable Devant backend endpoint. The next hardening step should ensure that bypassing API Manager cannot bypass the intended authentication and authorization controls.
