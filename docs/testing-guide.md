# JobBridge Testing Guide

## 1. Test Personas

| Persona | Expected role / access |
|---|---|
| Public user | Public `GET /jobs` and `POST /ai/match-jobs` |
| New organization applicant | No JobBridge role initially |
| Approved member | `MEMBER_ORGANIZATION` |
| Administrator | `ADMIN` |
| Job seeker | `JOB_SEEKER` |

Current public APIM base:

```text
https://35.231.59.214/jobbridge/1.0
```

## 2. Public API Tests

### GET jobs without token

From the Mac:

```bash
curl -i https://35.231.59.214/jobbridge/1.0/jobs
```

Expected:

```text
200
No Authorization header required
Only ACTIVE jobs returned
```

### AI matching without token

```bash
curl -i -X POST \
  https://35.231.59.214/jobbridge/1.0/ai/match-jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "profile": "I have five years of customer service experience and want part-time work in Coral Gables."
  }'
```

Expected: successful match response or a policy-specific `422`/`429` depending on input/quota.

## 3. OAuth and Scope Tests

Obtain a fresh Asgardeo access token after sign-in.

Confirm the **access token** contains expected scopes, not just the ID token.

### Member token

Expected API scopes:

```text
jobs:write
organization:manage
```

It should not contain `admin`.

### Admin token

Expected API scopes:

```text
jobs:write
organization:manage
admin
```

### Protected request without token

```bash
curl -i -X POST \
  https://35.231.59.214/jobbridge/1.0/jobs \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Expected:

```text
401 Unauthorized
```

### Member denied from admin resource

```bash
export MEMBER_TOKEN='<member-access-token>'

curl -i \
  https://35.231.59.214/jobbridge/1.0/admin/jobs/pending \
  -H "Authorization: Bearer $MEMBER_TOKEN"
```

Expected:

```text
403 Forbidden
```

### Admin allowed to admin resource

```bash
export ADMIN_TOKEN='<admin-access-token>'

curl -i \
  https://35.231.59.214/jobbridge/1.0/admin/jobs/pending \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Expected:

```text
200 OK
```

### Member POST /jobs

```bash
curl -i -X POST \
  https://35.231.59.214/jobbridge/1.0/jobs \
  -H "Authorization: Bearer $MEMBER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Senior Software Engineer",
    "organization": "CityWorks Inc",
    "location": "Miami, FL",
    "description": "Design, develop, and maintain cloud-native applications and APIs.",
    "employmentType": "Full-time",
    "salaryMin": 110000,
    "salaryMax": 140000,
    "applyUrl": "https://cityworks.example.com/jobs/senior-software-engineer"
  }'
```

Expected: request passes JWT, subscription, and `jobs:write` validation and reaches the backend.

## 4. Browser Routing Test

Open the deployed JobBridge app and inspect **Developer Tools -> Network**.

Expected `GET /jobs` Request URL:

```text
https://35.231.59.214/jobbridge/1.0/jobs
```

Expected AI Request URL:

```text
https://35.231.59.214/jobbridge/1.0/ai/match-jobs
```

The old route should not be used by the deployed browser:

```text
/choreo-apis/pablosu-jobbridge/jobboardapi/v1
```

If the browser still uses the old route, inspect the deployed `/config.js`. WSO2 Developer Platform runtime file mounts can override the file committed to GitHub.

## 5. Moesif Analytics Verification

After browser or curl requests pass through APIM, check Moesif Live Event Log/dashboard.

Expected:

- `JobBridge API`
- API version `1.0`
- operations such as `/jobs`, `/admin/jobs/pending`, `/ai/match-jobs`
- status codes and latency
- subscribed application metadata where applicable

Important diagnostic: direct Devant requests do not traverse APIM and therefore are not expected in this APIM Moesif stream.

On the VM:

```bash
grep -iE 'moesif|analytics' \
  ~/wso2/wso2am-4.7.0/repository/logs/wso2carbon.log | tail -100
```

Expected initialization:

```text
Initializing Moesif metric reporter
```

Connectivity test:

```bash
curl -v --max-time 10 https://api.moesif.net
```

Use the Moesif **Collector Application ID** in `deployment.toml`.

## 6. Public Job Search UI

1. Open JobBridge without signing in.
2. Confirm Find Jobs loads.
3. Confirm only active jobs appear.
4. Search by job title, organization, or location.
5. Confirm Apply opens the external URL.

## 7. AI Job Matcher

### Successful match

1. Confirm active jobs are loaded.
2. Enter a candidate profile.
3. Click **Find Matching Jobs**.
4. Confirm a loading state appears.
5. Confirm results are sorted by descending score.
6. Confirm each match shows title, organization, location, match percentage, AI reason, and Apply action.
7. Confirm the normal job list remains visible.

Expected response shape:

```json
{
  "matches": [
    {
      "jobId": "job-002",
      "score": 80,
      "reason": "..."
    }
  ]
}
```

Expected prompt constraints:

```text
score >= 60
maximum 5 matches
```

### Semantic Prompt Guard

Submit a configured denied/off-topic intent.

Expected:

```text
HTTP 422
JobBridge-friendly out-of-scope message
```

For unrelated input not caught by the semantic threshold, the system prompt is a fallback and should return:

```json
{"matches": []}
```

### Token Based Rate Limit

Current AI Gateway demo policy:

```text
2,000 total tokens / 60 seconds
```

If intentionally exhausted, expect `429` until the window resets.

### PII masking

Use fake test PII only. Confirm the matching request succeeds and inspect AI Gateway/Workspace observability where available.

## 8. Organization Registration

1. Register/sign in through Asgardeo.
2. Submit organization details.
3. Confirm status becomes `PENDING`.
4. Confirm protected API calls include the bearer token when the role/scope is applicable.

## 9. Administrator Organization Review

1. Sign in as `ADMIN`.
2. Open Admin Review.
3. Approve/reject a pending organization.
4. Verify database status.
5. Assign `MEMBER_ORGANIZATION` in Asgardeo after approval.
6. Verify the role permissions still include `jobs:write` and `organization:manage` under `APIM_GLOBAL_SCOPES`.
7. Sign out/in so the user receives a fresh token.

## 10. Job Submission and Review

### Member submission

1. Sign in as `MEMBER_ORGANIZATION`.
2. Submit a job.
3. Confirm status is `PENDING` and it is not public yet.

### Admin approval

1. Sign in as `ADMIN`.
2. Approve a pending job.
3. Confirm it appears in public search.
4. Confirm it becomes eligible for AI matching.

## 11. Local Smoke Tests

Backend:

```bash
curl -i http://localhost:9090/api/jobs

curl -i -X POST \
  http://localhost:9090/api/ai/match-jobs \
  -H 'Content-Type: application/json' \
  -d '{"profile":"I have five years of customer service experience."}'
```

Frontend:

```bash
cd job-board-ui
npm run dev
```

Local development uses `/api` through the Vite proxy to `127.0.0.1:9090`.

## 12. APIM VM Tests

With SSH tunnel active, direct internal gateway test from the Mac:

```bash
curl -k -i https://localhost:8243/jobbridge/1.0/jobs
```

Public trusted-TLS test:

```bash
curl -i https://35.231.59.214/jobbridge/1.0/jobs
```

The public test should work **without `-k`**.

## 13. AI Gateway Tests

On the AI Gateway VM:

```bash
docker compose ps
curl http://localhost:9094/api/admin/v1/health
```

Public AI proxy test should also use trusted HTTPS without `-k`.

## 14. Negative Tests

- Missing token on protected API operation -> `401`
- Valid token missing required scope -> `403`
- Unsubscribed/unmapped OAuth client where subscription validation applies
- Expired Asgardeo token
- Missing required fields
- Supplying another user's `ownerUserId`
- Database unavailable
- AI Gateway unavailable
- Invalid AI Gateway API key
- OpenAI provider unavailable
- Malformed LLM JSON response
- Semantic Prompt Guard intervention -> `422`
- Token quota exhausted -> `429`
- Direct Devant endpoint bypass attempt (architecture hardening check)

## 15. Known Test Caveats

- The direct Devant service remains a potential bypass path until network/backend hardening makes APIM the only supported ingress.
- AI output can vary; validate schema and constraints rather than exact wording.
- The semantic guard is deny-list based and is not a perfect classifier; the system prompt provides a fallback.
- Role-to-permission mappings in Asgardeo should be rechecked after deleting/recreating API resources.
