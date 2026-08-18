# JobBridge API Reference

## 1. Conventions

Local backend base URL:

```text
http://localhost:9090/api
```

Current deployed consumer/API Manager base URL:

```text
https://35.231.59.214/jobbridge/1.0
```

API Manager forwards to the deployed Devant backend service.

Content type:

```text
application/json
```

### Security

| Resource | Security |
|---|---|
| `GET /jobs` | Public |
| `POST /ai/match-jobs` | Public |
| `POST /jobs` | OAuth2 + `jobs:write` |
| `POST /organizations` | OAuth2 + `organization:manage` |
| `GET /organizations/me` | OAuth2 + `organization:manage` |
| `/admin/*` | OAuth2 + `admin` |

Protected calls also use APIM subscription validation. The bearer token is issued by Asgardeo and validated by API Manager through the Asgardeo Key Manager.

## 2. Public Job APIs

### GET `/jobs`

Returns active job postings.

Public deployed URL:

```text
https://35.231.59.214/jobbridge/1.0/jobs
```

No bearer token is required.

#### Response: `200 OK`

```json
[
  {
    "id": "job-002",
    "title": "Administrative Assistant",
    "organization": "Example Organization",
    "location": "Coral Gables, FL",
    "employmentType": "Part-time",
    "description": "Support office operations and communication.",
    "applyUrl": "https://example.com/jobs/admin-assistant",
    "status": "ACTIVE"
  }
]
```

Only `ACTIVE` jobs are returned.

---

### POST `/jobs`

Creates a pending job posting.

Required scope:

```text
jobs:write
```

Typical role:

```text
MEMBER_ORGANIZATION
```

#### Request

```json
{
  "title": "Senior Software Engineer",
  "organization": "CityWorks Inc",
  "location": "Miami, FL",
  "description": "Design, develop, and maintain cloud-native applications and APIs.",
  "employmentType": "Full-time",
  "salaryMin": 110000,
  "salaryMax": 140000,
  "applyUrl": "https://cityworks.example.com/jobs/senior-software-engineer"
}
```

#### Backend behavior

- Generates a UUID
- Sets `status = PENDING`
- Persists the job
- Returns confirmation

## 3. AI Job Matching API

### POST `/ai/match-jobs`

Ranks active JobBridge jobs against a short candidate profile.

The APIM operation is currently public, so no bearer token is required. The downstream AI Gateway remains protected by an App LLM Proxy API key and AI-specific policies.

#### Request

```json
{
  "profile": "I have five years of customer service experience, enjoy helping people, and want part-time work in Coral Gables."
}
```

#### Processing

```text
React
  -> APIM public POST /ai/match-jobs
  -> JobBridge Integration API
  -> getActiveJobs() / MySQL
  -> WSO2 AI Gateway
  -> PII + Semantic Prompt Guard + token quota
  -> OpenAI gpt-4o-mini
```

#### Response: `200 OK`

```json
{
  "matches": [
    {
      "jobId": "job-002",
      "score": 80,
      "reason": "The role aligns with the candidate's experience and location preference."
    }
  ]
}
```

React joins each `jobId` to the jobs already loaded in the browser.

#### Guardrail response: `422 Unprocessable Entity`

Example:

```json
{
  "message": "This request is outside the scope of JobBridge. Please describe your skills, experience, location, or job preferences."
}
```

#### Token quota response: `429 Too Many Requests`

The AI Gateway demo quota is currently:

```text
2,000 total tokens / 60 seconds
```

## 4. Organization APIs

### POST `/organizations`

Submits a new organization application.

Required scope:

```text
organization:manage
```

#### Request

```json
{
  "ownerUserId": "asgardeo-sub",
  "name": "Pabloco",
  "website": "https://www.example.com",
  "contactName": "Example Contact",
  "contactEmail": "admin@example.com",
  "description": "Technology and professional services organization."
}
```

Current implementation still receives `ownerUserId` from the frontend. A future hardening step should derive this value from the validated token.

---

### GET `/organizations/me?ownerUserId={userId}`

Returns the current user's organization application.

Required scope:

```text
organization:manage
```

## 5. Administrator Job APIs

All administrator job operations require:

```text
admin
```

### GET `/admin/jobs/pending`

Returns pending job postings.

### PUT `/admin/jobs/{id}/approve`

Approves a pending job and makes it eligible for public search and AI matching.

### PUT `/admin/jobs/{id}/reject`

Rejects a pending job.

## 6. Administrator Organization APIs

All administrator organization operations require:

```text
admin
```

### GET `/admin/organizations/pending`

Returns pending organization applications.

### PUT `/admin/organizations/{id}/approve`

Approves a pending organization.

Current operational follow-up includes assigning `MEMBER_ORGANIZATION` in Asgardeo and having the user obtain a fresh login/token.

### PUT `/admin/organizations/{id}/reject`

Rejects a pending organization.

## 7. OAuth / Scope Behavior

The JobBridge SPA requests:

```text
openid profile roles jobs:write organization:manage admin
```

Asgardeo RBAC filters the granted scopes by application-role permissions.

Expected examples:

```text
MEMBER_ORGANIZATION token
  jobs:write
  organization:manage
  no admin

ADMIN token
  jobs:write
  organization:manage
  admin
```

### Missing token

Protected operation without a valid token:

```text
401 Unauthorized
```

### Missing scope

Valid subscribed token without the resource scope:

```text
403 Forbidden
```

## 8. Subscription Validation

Protected API calls are associated with the APIM `JobBridge` Developer Portal application subscription.

The existing Asgardeo JobBridge SPA client ID is mapped to that APIM application through out-of-band provisioning. The SPA uses PKCE and does not have a client secret.

## 9. AI Gateway API

The JobBridge backend—not the browser—calls:

```http
POST <aiGatewayUrl>/chat/completions
X-API-Key: <aiGatewayApiKey>
Content-Type: application/json
```

The browser never receives the App LLM Proxy API key, the OpenAI provider key, or the embedding-provider key.

## 10. Recommended HTTP Status Standards

| Situation | Status |
|---|---:|
| Successful retrieval | `200` |
| Successful creation | `201` |
| Successful update | `200` or `204` |
| Invalid request | `400` |
| Missing/invalid token | `401` |
| Authenticated but unauthorized / scope missing | `403` |
| Resource not found | `404` |
| Conflict or duplicate application | `409` |
| AI semantic guardrail intervention | `422` |
| AI token quota exhausted | `429` |
| Upstream AI unavailable | `502` or `503` |
| Unexpected database or service error | `500` |

## 11. OpenAPI Source

Generate from the Ballerina implementation:

```bash
cd job_board_api
bal build --export-openapi
```

Output:

```text
target/openapi/api_openapi.yaml
```

That contract is imported into API Manager and is the basis for resource-specific scope configuration.

## 12. Planned API Improvements

- Prevent direct backend bypass of the API gateway.
- Derive organization ownership from the validated JWT subject.
- Standardize error bodies.
- Add pagination/filtering to jobs.
- Automate organization-role assignment.
- Review public AI matching abuse controls for production.
