# JobBridge Solution Architecture

## 1. Purpose

JobBridge is a small, purpose-built job board that connects job seekers with approved member organizations.

The solution is designed to demonstrate:

- Enterprise integration
- API-based application design
- Identity and access management
- Approval workflows
- Separation of frontend, integration, identity, API management, and persistence
- A path from local development to managed cloud deployment

## 2. Business Problem

Member organizations need a simple channel to publish jobs to a shared audience. Job seekers need an easy way to find active opportunities. Administrators need governance over which organizations and job postings become visible.

A general-purpose recruitment platform would add unnecessary complexity for this use case. JobBridge focuses only on the workflows required by the participating organizations.

## 3. Business Requirements

### Job seekers

- Browse active job postings
- Search available jobs
- View job details
- Follow an external application link
- Sign in when future personalized features require authentication

### Member organizations

- Self-register
- Submit organization details for approval
- View the current organization application status
- Post jobs after approval
- Submit postings for administrator review

### Administrators

- Review pending organization applications
- Approve or reject organizations
- Review pending job postings
- Approve or reject jobs

## 4. Current Logical Architecture

```text
+------------------------------+
| Job seekers                  |
| Member organizations         |
| Administrators               |
+---------------+--------------+
                |
                v
+------------------------------+
| JobBridge React/Vite UI      |
| - Job search                 |
| - Registration               |
| - Job submission             |
| - Admin review               |
+---------------+--------------+
                |
                | HTTP/JSON
                v
+------------------------------+
| WSO2 Integrator: BI          |
| JobBridge Integration API    |
| - Job operations             |
| - Organization operations    |
| - Approval workflows         |
| - MySQL access               |
+---------------+--------------+
                |
                v
+------------------------------+
| MySQL                        |
| - jobs                       |
| - organizations              |
+------------------------------+

Asgardeo
  - Authentication
  - Self-registration
  - ID and access tokens
  - Roles
```

## 5. Target Deployment Architecture

```text
                         Asgardeo
                  Authentication and roles
                              |
                              v
+----------------------+      |      +----------------------+
| Job seekers          |      |      | Administrators       |
| Member organizations |------+------|                      |
+----------+-----------+             +----------+-----------+
           |                                      |
           +------------------+-------------------+
                              |
                              v
                  JobBridge React Web App
                     Deployed in cloud
                              |
                              | OAuth access token
                              v
                    Bijira API Gateway
            Security, throttling, policies,
              analytics and API governance
                              |
                              v
             JobBridge Integration Service
                 WSO2 Integrator: BI
                    Deployed on Devant
                              |
                              v
                    Managed MySQL
```

## 6. Component Responsibilities

### React/Vite frontend

Responsible for:

- User interface
- Navigation
- Form collection
- Job search and display
- Calling backend APIs
- Sign-in and sign-out initiation
- Displaying role-aware views

The frontend must not be the final authority for authorization.

### WSO2 Integrator: BI service

Responsible for:

- Implementing JobBridge business workflows
- Validating requests
- Persisting and retrieving data
- Enforcing backend authorization
- Deriving user identity from validated tokens
- Returning business-level HTTP responses

### MySQL

Responsible for:

- Organization applications
- Organization lifecycle status
- Job postings
- Job lifecycle status
- Review metadata
- Future audit and application data

### Asgardeo

Responsible for:

- User authentication
- Self-registration
- Token issuance
- User identity
- Application roles

Current roles:

```text
ADMIN
MEMBER_ORGANIZATION
JOB_SEEKER
```

### Devant

Planned responsibilities:

- Build and deploy the integration
- Runtime configuration and secrets
- Environment promotion
- Logs and observability
- Managed database integration

### Bijira

Planned responsibilities:

- API gateway
- API lifecycle
- OAuth enforcement
- Scopes and policies
- Rate limiting
- Analytics
- Developer discovery and subscription

## 7. Organization Lifecycle

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

An approved organization is allowed to participate as a member organization. At present, the Asgardeo role is assigned manually after approval.

## 8. Job Lifecycle

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
Visible in public job search
```

Only `ACTIVE` jobs are returned by the public jobs endpoint.

## 9. Security Model

### Current state

- React reads roles from the Asgardeo ID token.
- React hides or shows views based on roles.
- Access tokens are sent to protected API requests.
- Some backend endpoints are not yet fully enforcing token-based authorization.
- `ownerUserId` is currently accepted from the browser for organization operations.

### Target state

- Bijira validates Asgardeo access tokens.
- Backend also validates or trusts only verified gateway identity.
- Backend derives the user ID from `sub`.
- Admin endpoints require `ADMIN`.
- Job creation requires `MEMBER_ORGANIZATION`.
- A member can post only for the organization they own.
- The browser never chooses another user's owner ID.
- Scopes complement roles.

Suggested scopes:

```text
jobs:read
jobs:write
organizations:register
admin:review
```

## 10. Design Decisions

### Integration service rather than direct database access

The frontend never connects directly to MySQL. All business and data access goes through the integration API.

### Approval before publication

Both organizations and jobs use a controlled status lifecycle. This prevents unapproved content from becoming public.

### Separate identity provider

Asgardeo centralizes registration, login, tokens, and roles rather than embedding identity logic in JobBridge.

### Separate API management

Bijira is planned as the consumer-facing API layer, while Devant operates the integration implementation.

### Monorepo

The frontend and backend are kept in one repository but deployed as separate components.

## 11. Known Architecture Gaps

- Jobs should reference `organizations.id` using `organization_id`.
- Organization approval should trigger role assignment.
- Backend security must be completed before public production use.
- API error responses should be standardized.
- A formal OpenAPI contract should be maintained.
- Auditing should record who reviewed each organization and job.
