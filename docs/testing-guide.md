# JobBridge Testing Guide

## 1. Test Personas

| Persona | Expected role |
|---|---|
| Public user | None |
| New organization applicant | No JobBridge role initially |
| Approved member | `MEMBER_ORGANIZATION` |
| Administrator | `ADMIN` |
| Job seeker | `JOB_SEEKER` |

## 2. Public Job Search

### Load active jobs

1. Open JobBridge without signing in.
2. Confirm Find Jobs loads.
3. Confirm only active jobs appear.
4. Confirm pending/rejected jobs are not visible.

Expected:

```text
GET /api/jobs returns only ACTIVE records.
```

### Search

1. Enter a job title, organization, or location.
2. Confirm matching jobs remain.
3. Clear search.
4. Confirm active jobs return.

### Apply

1. Select Apply.
2. Confirm the external application URL opens.

## 3. AI Job Matcher

### Successful match

1. Confirm active jobs are already loaded.
2. Enter:
   ```text
   I have five years of customer service experience, enjoy helping people, and want part-time work in Coral Gables.
   ```
3. Click **Find Matching Jobs**.
4. Confirm a loading state appears.
5. Confirm results are sorted by descending score.
6. Confirm each match shows:
   - title
   - organization
   - location
   - match percentage
   - AI reason
   - Apply action
7. Confirm the normal job list remains visible.

Expected backend request:

```http
POST /api/ai/match-jobs
Content-Type: application/json
```

Expected shape:

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

Expected matcher constraints:

```text
score >= 60
maximum 5 matches
```

### Join behavior

Confirm the React app does not fetch individual job details for AI matches. It should join each returned `jobId` against the existing `jobs` state.

### Empty profile

Confirm an empty profile does not submit or is handled cleanly.

### No matches

Use a profile unlikely to match available jobs and confirm the UI displays a sensible no-results state.

### AI service failure

Stop or make the AI Gateway unavailable and confirm:

- the normal jobs list still loads
- the matcher displays an error state
- the rest of JobBridge remains usable

Restore the gateway afterward.

## 4. Authentication

### Sign in

1. Click Sign In.
2. Authenticate through Asgardeo.
3. Confirm JobBridge returns to the frontend.
4. Confirm role-aware tabs display.

### Sign out

1. Click Sign Out.
2. Confirm the session ends.
3. Confirm protected tabs disappear.

## 5. Organization Registration

### New self-registered user

1. Register through Asgardeo.
2. Sign in.
3. Confirm Register Organization appears.
4. Confirm Post a Job does not appear.
5. Submit organization details.
6. Confirm status changes to Pending.
7. Refresh.
8. Confirm Pending remains.

Expected:

```text
organizations.status = PENDING
```

## 6. Administrator Organization Review

### Approve

1. Sign in as `ADMIN`.
2. Open Admin Review.
3. Confirm pending organizations appear.
4. Approve one.
5. Confirm it disappears from pending.
6. Verify database status is `ACTIVE`.
7. Assign `MEMBER_ORGANIZATION` in Asgardeo.
8. Sign out/in and confirm Post a Job appears.

### Reject

Confirm rejected organizations move to `REJECTED`.

## 7. Job Submission

1. Sign in as `MEMBER_ORGANIZATION`.
2. Open Post a Job.
3. Submit a job.
4. Confirm success.
5. Confirm job is not public until approved.

Expected:

```text
jobs.status = PENDING
```

## 8. Administrator Job Review

### Approve

1. Sign in as `ADMIN`.
2. Open Admin Review.
3. Approve a pending job.
4. Return to Find Jobs.
5. Confirm the job is public.
6. Run AI matching and confirm the newly active job is now eligible to be included by the matcher.

### Reject

Confirm rejected jobs are not public and are not eligible for AI matching.

## 9. Local Smoke Tests

Backend:

```bash
curl -i http://localhost:9090/api/jobs

curl -i   -X POST   http://localhost:9090/api/ai/match-jobs   -H "Content-Type: application/json"   -d '{
    "profile": "I have five years of customer service experience and want part-time work in Coral Gables."
  }'
```

Frontend:

```bash
cd job-board-ui
npm run dev
```

Open:

```text
http://localhost:5173
```

Confirm local requests use `/api`, which Vite proxies to `127.0.0.1:9090`.

## 10. Cloud AI Gateway Tests

### VM health

On the GCP VM:

```bash
docker compose ps
curl http://localhost:9094/api/admin/v1/health
```

Expected:

```text
healthy
```

### Direct runtime test

```bash
curl -k -X POST   "https://localhost:8443/jobbridge/jobbridge-ai-prod/chat/completions"   -H "Content-Type: application/json"   -H "X-API-Key: <proxy-key>"   -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {
        "role": "user",
        "content": "Return exactly: direct cloud gateway test"
      }
    ]
  }'
```

### Public HTTPS test

From another machine:

```bash
curl -X POST   "https://<public-host-or-ip>/jobbridge/jobbridge-ai-prod/chat/completions"   -H "Content-Type: application/json"   -H "X-API-Key: <proxy-key>"   -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {
        "role": "user",
        "content": "Return exactly: JobBridge cloud AI Gateway is working"
      }
    ]
  }'
```

Do not use `-k` for the public HTTPS test.

## 11. Deployed End-to-End Smoke Test

1. Open deployed JobBridge.
2. Confirm jobs load.
3. Run search/filter.
4. Run AI matching.
5. Inspect browser Network:
   ```text
   /choreo-apis/pablosu-jobbridge/jobboardapi/v1/ai/match-jobs
   ```
6. Confirm `200` or `201`.
7. Confirm ranked matches render.
8. Quick-check sign-in, job posting, and admin paths.

## 12. Negative Tests

- Missing required fields
- Invalid email
- Invalid URL
- Unknown organization ID
- Approving/rejecting already processed records
- Calling privileged operations without intended role
- Supplying another user's `ownerUserId`
- Database unavailable
- AI Gateway unavailable
- Invalid AI Gateway key
- OpenAI provider unavailable
- Malformed LLM JSON response
- Expired access token where token enforcement applies

## 13. Known Test Caveats

- Backend end-user OAuth2 enforcement is not active on the deployed Developer Platform path.
- `GET /api/organizations/me` may still need explicit not-found handling depending on the current flow.
- AI output can vary between requests; validate structure and constraints rather than exact wording.

