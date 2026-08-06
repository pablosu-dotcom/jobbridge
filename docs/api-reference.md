# JobBridge API Reference

## 1. Conventions

Local base URL:

```text
http://localhost:9090/api
```

Planned managed API base URL:

```text
https://<bijira-gateway>/jobbridge/1.0
```

Content type:

```text
application/json
```

Authenticated calls send:

```http
Authorization: Bearer <access-token>
```

## 2. Public Job APIs

### GET `/jobs`

Returns active job postings.

#### Response: `200 OK`

```json
[
  {
    "id": "690d8be7-4ac8-4627-940c-9427aa9f5d1d",
    "title": "QA Tester",
    "organization": "Pabloco",
    "location": "Miami, FL",
    "employmentType": "part-time",
    "description": "Test applications",
    "applyUrl": "https://www.pabloco.com",
    "status": "ACTIVE"
  }
]
```

Only jobs with `status = ACTIVE` should be returned.

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
  "employmentType": "part-time",
  "description": "Test applications",
  "applyUrl": "https://www.pabloco.com"
}
```

#### Backend behavior

- Generate a UUID
- Set `status = PENDING`
- Persist the job
- Return confirmation

#### Example response

```json
{
  "message": "Job submitted for administrator review."
}
```

## 3. Organization APIs

### POST `/organizations`

Submits a new organization application.

#### Request

```json
{
  "ownerUserId": "asgardeo-sub",
  "name": "Pabloco",
  "website": "https://www.pabloco.com",
  "contactName": "Pablo Suarez",
  "contactEmail": "admin@pabloco.com",
  "description": "Technology and professional services organization."
}
```

#### Current behavior

- Generates a UUID
- Stores the owner user ID supplied by the frontend
- Sets `status = PENDING`

#### Target behavior

The backend should ignore any browser-supplied owner ID and derive it from the validated access token `sub` claim.

---

### GET `/organizations/me?ownerUserId={userId}`

Returns the current user's organization application.

#### Example response: `200 OK`

```json
{
  "id": "c1c54ad9-2f38-43d8-9169-9c488e6e22d5",
  "ownerUserId": "asgardeo-sub",
  "name": "Pabloco",
  "website": "https://www.pabloco.com",
  "contactName": "Pablo Suarez",
  "contactEmail": "admin@pabloco.com",
  "description": "Technology and professional services organization.",
  "status": "PENDING"
}
```

#### Desired no-application response

```http
404 Not Found
```

```json
{
  "message": "Organization application not found."
}
```

#### Current limitation

The no-row path may still return `500` until the resource flow is updated to treat no rows as a normal business result.

## 4. Administrator Job APIs

### GET `/admin/jobs/pending`

Returns pending job postings.

#### Intended authorization

`ADMIN`

#### Response

```json
[
  {
    "id": "690d8be7-4ac8-4627-940c-9427aa9f5d1d",
    "title": "QA Tester",
    "organization": "Pabloco",
    "location": "Miami, FL",
    "employmentType": "part-time",
    "description": "Test applications",
    "applyUrl": "https://www.pabloco.com",
    "status": "PENDING"
  }
]
```

---

### PUT `/admin/jobs/{id}/approve`

Approves a pending job.

#### SQL behavior

```sql
UPDATE jobs
SET status = 'ACTIVE'
WHERE id = ?
  AND status = 'PENDING';
```

#### Success response

```json
{
  "message": "Job approved successfully."
}
```

---

### PUT `/admin/jobs/{id}/reject`

Rejects a pending job.

#### SQL behavior

```sql
UPDATE jobs
SET status = 'REJECTED'
WHERE id = ?
  AND status = 'PENDING';
```

#### Success response

```json
{
  "message": "Job rejected successfully."
}
```

## 5. Administrator Organization APIs

### GET `/admin/organizations/pending`

Returns pending organization applications.

#### Intended authorization

`ADMIN`

#### Response

```json
[
  {
    "id": "c1c54ad9-2f38-43d8-9169-9c488e6e22d5",
    "ownerUserId": "asgardeo-sub",
    "name": "Pabloco",
    "website": "https://www.pabloco.com",
    "contactName": "Pablo Suarez",
    "contactEmail": "admin@pabloco.com",
    "description": "Technology and professional services organization.",
    "status": "PENDING"
  }
]
```

---

### PUT `/admin/organizations/{id}/approve`

Approves a pending organization.

#### SQL behavior

```sql
UPDATE organizations
SET status = 'ACTIVE',
    reviewed_at = CURRENT_TIMESTAMP
WHERE id = ?
  AND status = 'PENDING';
```

#### Success response

```json
{
  "message": "Organization approved successfully."
}
```

#### Current operational follow-up

Assign the Asgardeo `MEMBER_ORGANIZATION` role manually, then have the user sign out and sign in again.

---

### PUT `/admin/organizations/{id}/reject`

Rejects a pending organization.

#### SQL behavior

```sql
UPDATE organizations
SET status = 'REJECTED',
    reviewed_at = CURRENT_TIMESTAMP
WHERE id = ?
  AND status = 'PENDING';
```

#### Success response

```json
{
  "message": "Organization rejected successfully."
}
```

## 6. Recommended HTTP Status Standards

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
| Unexpected database or service error | `500` |

## 7. Planned API Improvements

- Replace query-string user ID with token-derived identity.
- Add an OpenAPI definition.
- Apply API scopes in Bijira.
- Standardize error bodies.
- Add pagination and filtering to jobs.
- Add organization ownership validation.
- Add review reasons and audit fields.
