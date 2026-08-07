# JobBridge Deployment Guide

## 1. Deployment Strategy

Current platform layout:

| Concern | Platform |
|---|---|
| Frontend | WSO2 Developer Platform Web Application |
| Integration runtime | WSO2 Developer Platform / Devant Integration |
| Database | Devant-managed MySQL |
| Identity | Asgardeo |
| API management | Bijira — planned |
| Source control | GitHub |

The frontend and backend are in the same JobBridge project but are deployed as separate components from a shared monorepo.

## 2. Repository Layout

```text
local-job-board/
├── job_board_api/
├── job-board-ui/
├── docs/
└── README.md
```

Component directories:

```text
Backend:  /job_board_api
Frontend: /job-board-ui
```

Using the correct component directory is important. The Ballerina buildpack must run with `job_board_api` as its build context so that `target/bin/job_board_api.jar` is discovered correctly.

## 3. GitHub Preparation

Recommended `.gitignore` entries:

```gitignore
.DS_Store
**/.DS_Store

.env
.env.*
!.env.example

Config.toml
**/Config.toml
!**/Config.toml.example

node_modules/
**/node_modules/

dist/
**/dist/

target/
**/target/

.vscode/
```

Do not commit real database credentials or local secrets.

## 4. Backend Configurables

Current `config.bal` values:

```ballerina
configurable string mysqlUser = ?;
configurable string mysqlHost = ?;
configurable string mysqlPassword = ?;
configurable string mysqlDatabase = ?;
configurable int mysqlPort = ?;
```

The MySQL client uses the configurable port rather than hard-coding `3306`, because the managed database may expose a different port.

## 5. Managed MySQL

### Provisioning

Use the Platform Engineer profile and create a managed MySQL database.

The deployed JobBridge database contains:

```text
jobbridge
├── jobs
└── organizations
```

The database schema must match the fields used by the Ballerina SQL queries. During deployment, an initial query failure identified a missing `salary_min` column; the managed schema was updated to match the application model.

### Runtime configuration

The working deployment uses a **configuration group** rather than hard-coded credentials or a committed `Config.toml`.

The configuration group supplies:

```text
mysqlUser
mysqlHost
mysqlPassword
mysqlDatabase
mysqlPort
```

This allows the backend to receive the managed database values without storing secrets in GitHub.

## 6. Backend Deployment

1. Create/import the backend integration from the GitHub repository.
2. Set the component directory to:

```text
/job_board_api
```

3. Use the Ballerina / WSO2 Integrator build preset.
4. Confirm the build produces:

```text
target/bin/job_board_api.jar
```

5. Link the MySQL configuration group.
6. Deploy to the Development environment.
7. Use Application Logs and Gateway Logs for troubleshooting.
8. Verify the API with GET and POST operations.

A previous startup failure:

```text
determine start command: when there is no default process a command is required
```

was caused by using the repository root as the build context. Setting the component directory to `/job_board_api` fixed the issue.

## 7. Frontend Web Application

Create a Web Application component from:

```text
/job-board-ui
```

Use:

```text
Build command: npm ci && npm run build
Build path:    dist
Node version:  22
```

A successful Vite build produces the static application under `dist/`.

## 8. UI-to-API Connection

The web application and backend integration are connected inside the same JobBridge project.

The frontend uses the platform-generated route:

```text
/choreo-apis/jobbridge/jobboardapi/v1
```

The runtime configuration is stored in:

```text
job-board-ui/public/config.js
```

Example:

```javascript
window.configs = {
  apiUrl: "/choreo-apis/jobbridge/jobboardapi/v1"
};
```

The frontend resolves the API base URL with:

```javascript
const API_BASE_URL =
  window?.configs?.apiUrl ||
  import.meta.env.VITE_API_BASE_URL ||
  "/api";
```

API calls use:

```javascript
fetch(`${API_BASE_URL}/jobs`);
```

instead of directly calling `/api/jobs`.

For Vite, `public/config.js` is served as:

```text
/config.js
```

and `index.html` loads it before the React entry script:

```html
<script src="/config.js"></script>
<script type="module" src="/src/main.jsx"></script>
```

## 9. Asgardeo OIDC

The existing Asgardeo SPA integration remains in place.

The redirect URL is determined at runtime:

```javascript
const appUrl = window.location.origin;
```

Configuration:

```javascript
const authConfig = {
  clientID: "<asgardeo-client-id>",
  baseUrl: "https://api.asgardeo.io/t/<tenant>",
  signInRedirectURL: appUrl,
  signOutRedirectURL: appUrl,
  scope: ["openid", "profile", "roles"],
};
```

Register both the local and deployed origins in Asgardeo.

Example:

```text
http://localhost:5173
https://<jobbridge-web-host>
```

Redirect URLs must match exactly. A trailing `/` mismatch can cause:

```text
Application callback URL does not match the registered redirect URL
```

The JobBridge logo can be served from:

```text
https://<jobbridge-web-host>/jobbridge-logo.png
```

and used as the Asgardeo branding logo URL.

## 10. Current API Security

For the MVP, OAuth 2 enforcement on the JobBridge API is disabled in the Integration Platform security configuration.

This means:

```text
Asgardeo
   |
   | OIDC login for the React application
   v
React UI
   |
   | Project connection
   v
JobBridge API
```

Asgardeo currently authenticates the user to the application, but the backend API is not yet enforcing Asgardeo access tokens.

A `401` with WSO2 code `900901` and `WWW-Authenticate: invalid_token` was resolved by disabling OAuth 2 enforcement on the API for this MVP phase.

## 11. Observability

Use:

- **Gateway Logs** to confirm routing, request path, response code, and gateway behavior.
- **Application Logs** to see Ballerina runtime and SQL errors.
- Build logs to diagnose component-directory and buildpack issues.

Example application-level database errors are more useful than gateway `500` responses because they expose the underlying SQL exception.

## 12. Bijira API Management — Planned

After the MVP is stable:

1. Create the JobBridge API in Bijira.
2. Use the integration service as the backend.
3. Import or maintain an OpenAPI contract.
4. Enable OAuth security.
5. Add scopes such as:
   - `jobs:read`
   - `jobs:write`
   - `organizations:register`
   - `admin:review`
6. Apply throttling and policies.
7. Add analytics and governance.
8. Update the frontend connection to the governed gateway path as appropriate.

## 13. Production Readiness Checklist

- [x] Frontend deployed
- [x] Backend integration deployed
- [x] Managed MySQL connected
- [x] Database credentials kept out of GitHub
- [x] Asgardeo OIDC login working
- [x] JobBridge logo configured in Asgardeo
- [x] UI-to-API project connection working
- [ ] Access tokens validated by API layer
- [ ] Roles enforced by backend
- [ ] User identity derived from validated token
- [ ] Admin endpoints protected server-side
- [ ] Organization ownership enforced server-side
- [ ] CORS/security policy finalized for production
- [ ] Production backups configured
- [ ] Logs and alerts operationalized
- [ ] OpenAPI contract governed
- [ ] Audit records captured
- [ ] Bijira API management enabled
