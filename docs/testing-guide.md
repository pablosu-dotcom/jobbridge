# JobBridge Testing Guide

## 1. Test Personas

Create or use these users:

| Persona | Expected role |
|---|---|
| Public user | None |
| New organization applicant | No JobBridge role initially |
| Approved member | `MEMBER_ORGANIZATION` |
| Administrator | `ADMIN` |
| Job seeker | `JOB_SEEKER` |

## 2. Public Job Search

### Scenario: Load active jobs

1. Open JobBridge without signing in.
2. Confirm the Find Jobs view loads.
3. Confirm only active jobs appear.
4. Confirm pending and rejected jobs are not visible.

Expected result:

```text
GET /api/jobs returns only ACTIVE records.
```

### Scenario: Search

1. Enter a job title, organization, or location.
2. Confirm matching jobs remain.
3. Clear the search.
4. Confirm all active jobs return.

### Scenario: Apply

1. Select Apply on a job.
2. Confirm the external application URL opens.

## 3. Authentication

### Scenario: Sign in

1. Click Sign In.
2. Authenticate through Asgardeo.
3. Confirm JobBridge returns to the frontend.
4. Confirm the correct role-aware tabs display.

### Scenario: Sign out

1. Click Sign Out.
2. Confirm the session ends.
3. Confirm protected tabs disappear.

## 4. Organization Registration

### Scenario: New self-registered user

1. Register through Asgardeo.
2. Sign in.
3. Confirm Register Organization appears.
4. Confirm Post a Job does not appear.
5. Submit organization details.
6. Confirm the status changes to Pending.
7. Refresh the browser.
8. Confirm pending status remains.

Expected database state:

```text
organizations.status = PENDING
```

### Scenario: Duplicate application

1. Attempt to submit a second organization for the same owner.
2. Confirm the API rejects the duplicate.

Expected target response:

```http
409 Conflict
```

## 5. Administrator Organization Review

### Scenario: Load pending applications

1. Sign in as `ADMIN`.
2. Open Admin Review.
3. Confirm pending organizations appear.
4. Confirm contact, email, website, and description display.

### Scenario: Approve organization

1. Click Approve.
2. Confirm the card disappears.
3. Verify MySQL.

```sql
SELECT id, name, status, reviewed_at
FROM organizations
WHERE id = '<organization-id>';
```

Expected:

```text
status = ACTIVE
reviewed_at is populated
```

4. Assign `MEMBER_ORGANIZATION` manually in Asgardeo.
5. Have the user sign out and sign in.
6. Confirm Post a Job appears.

### Scenario: Reject organization

1. Submit another pending organization.
2. Click Reject.
3. Confirm the card disappears.
4. Verify:

```text
status = REJECTED
```

## 6. Job Submission

### Scenario: Approved member submits a job

1. Sign in as `MEMBER_ORGANIZATION`.
2. Open Post a Job.
3. Complete the form.
4. Submit.
5. Confirm the success message.
6. Verify the job is not yet public.

Expected database state:

```text
jobs.status = PENDING
```

## 7. Administrator Job Review

### Scenario: Approve job

1. Sign in as `ADMIN`.
2. Open Admin Review.
3. Confirm the job appears under pending jobs.
4. Click Approve.
5. Confirm the card disappears.
6. Return to Find Jobs.
7. Confirm the job is now public.

Expected database state:

```text
jobs.status = ACTIVE
```

### Scenario: Reject job

1. Submit another pending job.
2. Click Reject.
3. Confirm it disappears from pending review.
4. Confirm it does not appear publicly.

Expected database state:

```text
jobs.status = REJECTED
```

## 8. API Smoke Tests

```bash
curl -i http://localhost:9090/api/jobs

curl -i \
  http://localhost:9090/api/admin/organizations/pending

curl -i \
  -X PUT \
  http://localhost:9090/api/admin/organizations/ORGANIZATION_ID/approve

curl -i \
  -X PUT \
  http://localhost:9090/api/admin/organizations/ORGANIZATION_ID/reject
```

## 9. Negative Tests

- Missing required fields
- Invalid email
- Invalid URL
- Unknown organization ID
- Approving an already approved record
- Rejecting an already rejected record
- Calling admin endpoints without `ADMIN`
- Posting jobs without `MEMBER_ORGANIZATION`
- Supplying another user's `ownerUserId`
- Database unavailable
- Expired access token

## 10. Known Test Caveat

`GET /api/organizations/me` may currently return `500` when no row exists. The intended behavior is `404`. Until corrected, frontend testing should distinguish this known behavior from a true unexpected database outage.
