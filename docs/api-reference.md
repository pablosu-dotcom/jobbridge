# JobBridge API Reference

## 1. Conventions

Local base URL:

```text
http://localhost:9090/api
```

Current deployed web-app route:

```text
/choreo-apis/pablosu-jobbridge/jobboardapi/v1
```

Content type:

```text
application/json
```

The active deployed MVP backend path does not currently enforce end-user OAuth2. A separate API Platform proxy has been tested with OAuth2 using the built-in STS but is not the route currently used by the deployed web app.

## 2. Public Job APIs

### GET `/jobs`

Returns active job postings.

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

Only jobs with `status = ACTIVE` are returned.

---

### POST `/jobs`

Creates a pending job posting.

#### Intended authorization

`MEMBER_ORGANIZATION`

#### Request

```json
{
  "title": "QA Tester",
  "organization": "Pabloco",
  "location": "Miami, FL",
  "employmentType": "Part-time",
  "description": "Test applications",
  "applyUrl": "https://www.example.com/jobs/qa",
  "salaryMin": 18,
  "salaryMax": 22
}
```

#### Backend behavior

- Generates a UUID
- Sets `status = PENDING`
- Persists the job
- Returns confirmation

## 3. AI Job Matching API

### POST `/ai/match-jobs`

Ranks currently active JobBridge jobs against a short candidate profile.

#### Request

```json
{
  "profile": "I have five years of customer service experience, enjoy helping people, and want part-time work in Coral Gables."
}
```

#### Processing

The backend:

1. Calls `getActiveJobs()`.
2. Builds a prompt using the candidate profile and active jobs.
3. Calls the production WSO2 AI Gateway App LLM Proxy.
4. Uses `gpt-4o-mini`.
5. Parses the model's JSON-only response into typed JobBridge records.
6. Returns at most five matches with score `>= 60`.

#### Response: `200` or `201`

```json
{
  "matches": [
    {
      "jobId": "job-002",
      "score": 80,
      "reason": "The part-time Administrative Assistant role aligns well with the candidate's customer service experience and interest in helping people."
    },
    {
      "jobId": "68683c00-d5de-4ac7-ba30-f84d831a1365",
      "score": 60,
      "reason": "The part-time QA Tester role is a weaker but still relevant match based on transferable communication and problem-solving skills."
    }
  ]
}
```

The AI endpoint returns match metadata rather than duplicating the complete job object. The React application joins each `jobId` to the jobs already loaded in the browser.

#### AI Gateway dependency

The deployed backend uses:

```text
aiGatewayUrl    = https://<public-host-or-ip>/jobbridge/jobbridge-ai-prod
aiGatewayApiKey = <server-side secret>
```

The API key is never returned to or stored in the browser.

## 4. Organization APIs

### POST `/organizations`

Submits a new organization application.

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

#### Current behavior

- Generates a UUID
- Stores the owner user ID supplied by the frontend
- Sets `status = PENDING`

#### Target behavior

The backend should derive identity from a validated token instead of trusting a browser-supplied owner ID.

---

### GET `/organizations/me?ownerUserId={userId}`

Returns the current user's organization application.

#### Example response: `200 OK`

```json
{
  "id": "c1c54ad9-2f38-43d8-9169-9c488e6e22d5",
  "ownerUserId": "asgardeo-sub",
  "name": "Pabloco",
  "website": "https://www.example.com",
  "contactName": "Example Contact",
  "contactEmail": "admin@example.com",
  "description": "Technology and professional services organization.",
  "status": "PENDING"
}
```

## 5. Administrator Job APIs

### GET `/admin/jobs/pending`

Returns pending job postings.

Intended authorization:

```text
ADMIN
```

### PUT `/admin/jobs/{id}/approve`

Approves a pending job and makes it eligible for public search and AI matching.

### PUT `/admin/jobs/{id}/reject`

Rejects a pending job.

## 6. Administrator Organization APIs

### GET `/admin/organizations/pending`

Returns pending organization applications.

Intended authorization:

```text
ADMIN
```

### PUT `/admin/organizations/{id}/approve`

Approves a pending organization.

Operational follow-up currently includes assigning the Asgardeo `MEMBER_ORGANIZATION` role manually and having the user sign in again.

### PUT `/admin/organizations/{id}/reject`

Rejects a pending organization.

## 7. AI Gateway API

JobBridge does not expose the App LLM Proxy directly to the browser.

The backend calls an OpenAI-compatible endpoint:

```http
POST <aiGatewayUrl>/chat/completions
X-API-Key: <aiGatewayApiKey>
Content-Type: application/json
```

Request shape:

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "user",
      "content": "<JobBridge matching prompt>"
    }
  ]
}
```

The WSO2 AI Gateway routes the request to the configured OpenAI LLM Provider.

## 8. Recommended HTTP Status Standards

| Situation | Status |
|---|---:|
| Successful retrieval | `200` |
| Successful creation | `201` |
| Successful update | `200` or `204` |
| Invalid request | `400` |
| Missing/invalid token | `401` |
| Authenticated but unauthorized | `403` |
| Resource not found | `404` |
| Conflict or duplicate application | `409` |
| Upstream AI unavailable | `502` or `503` |
| Unexpected database or service error | `500` |

## 9. Planned API Improvements

- Derive identity from validated tokens.
- Add/maintain a formal OpenAPI definition.
- Decide whether the deployed application will route through WSO2 API Platform.
- Apply scopes and policies if API Platform becomes the active consumer-facing route.
- Standardize error bodies.
- Add pagination/filtering to jobs.
- Add organization ownership validation.
- Add AI-specific error handling, timeout behavior, and fallback messaging.

