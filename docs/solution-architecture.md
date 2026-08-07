# JobBridge Solution Architecture

## 1. Purpose

JobBridge is a small, purpose-built job board that connects job seekers with approved member organizations.

The solution demonstrates:

- Enterprise integration
- API-based application design
- Identity and access management
- Approval workflows
- Managed cloud deployment
- Separation of presentation, integration, identity, persistence, and future API governance

## 2. Business Problem

Member organizations need a simple channel to publish jobs to a shared audience. Job seekers need an easy way to find active opportunities. Administrators need governance over which organizations and job postings become visible.

A general-purpose recruitment platform would add unnecessary complexity. JobBridge focuses on the workflows required by participating organizations.

## 3. Business Requirements

### Job seekers

- Browse active job postings
- Search available jobs
- View job details
- Follow an external application link
- Sign in with Asgardeo

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
| JobBridge Integration API    |
| WSO2 Integrator / Ballerina  |
| - Job operations             |
| - Organization operations    |
| - Approval workflows         |
| - MySQL access               |
+---------------+--------------+
                |
                v
+------------------------------+
| Managed MySQL                |
| - jobs                       |
| - organizations              |
+------------------------------+

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
+---------------------------------------------------+
| WSO2 Developer Platform                          |
|                                                   |
|  +---------------------------------------------+  |
|  | JobBridge React/Vite Web Application       |  |
|  |                                             |  |
|  | Runtime config: /config.js                  |  |
|  +----------------------+----------------------+  |
|                         |                         |
|                         | /choreo-apis/...        |
|                         v                         |
|  +---------------------------------------------+  |
|  | JobBridge Integration API                  |  |
|  | WSO2 Integrator / Ballerina                |  |
|  |                                             |  |
|  | Runtime configuration group                |  |
|  +----------------------+----------------------+  |
|                         |                         |
+-------------------------|-------------------------+
                          |
                          v
                 Devant-managed MySQL
                 +-------------------+
                 | jobs              |
                 | organizations     |
                 +-------------------+
```

The backend API currently has OAuth 2 enforcement disabled. Asgardeo authenticates the user to the React application, while backend API authorization remains an MVP hardening item.

## 6. Target Governed Architecture

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
                              |
                              v
                    Bijira API Gateway
            OAuth, policies, throttling,
             analytics and API governance
                              |
                              v
             JobBridge Integration Service
                 WSO2 Integrator / Ballerina
                              |
                              v
                    Managed MySQL
```

Bijira is intentionally shown only in the **target** architecture because it is not part of the currently deployed MVP path.

## 7. Component Responsibilities

### React/Vite frontend

Responsible for:

- User interface
- Navigation
- Form collection
- Job search and display
- Calling backend APIs
- Initiating Asgardeo sign-in and sign-out
- Displaying role-aware views

The frontend is not intended to be the final authority for authorization.

### JobBridge Integration API

Responsible for:

- Implementing business workflows
- Validating requests
- Persisting and retrieving data
- Organization and job lifecycle operations
- Returning business-level HTTP responses

Future responsibilities include server-side token validation, role enforcement, and identity-derived ownership checks.

### Managed MySQL

Responsible for:

- Organization applications
- Organization lifecycle status
- Job postings
- Job lifecycle status
- Review metadata
- Future audit/application data

### Asgardeo

Responsible for:

- OIDC authentication
- Self-registration
- User identity
- Application roles
- Login branding

Current application roles:

```text
ADMIN
MEMBER_ORGANIZATION
JOB_SEEKER
```

### WSO2 Developer Platform / Devant

Current responsibilities:

- Build and deploy the Ballerina integration
- Build and deploy the React web application
- Runtime configuration and secrets
- Configuration groups
- Managed MySQL provisioning and connectivity
- Environment deployment
- Application, gateway, and build logs
- Project-level component connections

### Bijira

Planned responsibilities:

- API gateway
- API lifecycle
- OAuth enforcement
- Scopes and policies
- Rate limiting
- Analytics
- Developer discovery and subscription

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

An approved organization is allowed to participate as a member organization. At present, role assignment remains a separate administrative step.

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
Visible in public job search
```

Only `ACTIVE` jobs are intended for the public job-search experience.

## 10. Security Model

### Current deployed state

- Asgardeo provides OIDC authentication for the React application.
- React reads user identity/roles and renders role-aware views.
- Redirect URLs are derived from `window.location.origin` so local and deployed environments can use the same code.
- OAuth 2 enforcement on the JobBridge integration API is currently disabled.
- The UI reaches the backend through the platform project connection.
- Some authorization decisions remain in the frontend.
- `ownerUserId` is currently accepted from the browser for organization operations.

### Target state

- Bijira validates Asgardeo access tokens.
- The backend consumes only trusted/validated identity.
- The backend derives the user ID from `sub`.
- Admin operations require `ADMIN`.
- Job creation requires `MEMBER_ORGANIZATION`.
- A member can post only for the organization they own.
- The browser cannot choose another user's owner ID.
- Scopes complement roles.

Suggested future scopes:

```text
jobs:read
jobs:write
organizations:register
admin:review
```

## 11. Key Deployment Decisions

### Monorepo with explicit component directories

The frontend and backend remain in one GitHub repository, but the platform imports them independently:

```text
/job-board-ui
/job_board_api
```

This is important for correct buildpack behavior.

### Runtime database configuration

Managed MySQL values are supplied through a configuration group rather than committed configuration files.

### Runtime frontend API configuration

The React application uses:

```text
public/config.js
```

with:

```javascript
window.configs = {
  apiUrl: "/choreo-apis/jobbridge/jobboardapi/v1"
};
```

This avoids hard-coding the backend URL throughout the application.

### Asgardeo redirect portability

The SPA uses:

```javascript
const appUrl = window.location.origin;
```

for sign-in and sign-out redirects so the same source works locally and in the deployed environment.

### Integration service rather than direct database access

The frontend never connects directly to MySQL. All business and data access goes through the integration API.

### Approval before publication

Both organizations and jobs use controlled status lifecycles to prevent unapproved content from becoming public.

## 12. Known Architecture Gaps

- API-level OAuth and authorization are not yet enforced.
- Backend authorization should replace frontend-only trust for privileged operations.
- Jobs should reference `organizations.id` through `organization_id`.
- Organization approval should trigger role assignment.
- Backend identity should come from a validated token rather than browser-supplied ownership data.
- API error responses should be standardized.
- A formal OpenAPI contract should be maintained and governed.
- Auditing should record who reviewed each organization and job.
- Production backup, monitoring, and alerting policies should be finalized.
