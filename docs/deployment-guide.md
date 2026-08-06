# JobBridge Deployment Guide

## 1. Deployment Strategy

Planned platform split:

| Concern | Platform |
|---|---|
| Frontend | Cloud web application |
| Integration runtime | Devant |
| Database | Devant-managed or external managed MySQL |
| Identity | Asgardeo |
| API management | Bijira |
| Source control | GitHub |

## 2. Repository Layout

```text
local-job-board/
├── job_board_api/
├── job-board-ui/
├── docs/
└── README.md
```

The repository is a monorepo. The backend and frontend are deployed independently from their respective source paths.

## 3. GitHub Preparation

Recommended `.gitignore`:

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

Do not commit:

```text
job-board-ui/.env
job_board_api/Config.toml
```

## 4. Backend Configurables

`config.bal`:

```ballerina
configurable string dbHost = ?;
configurable int dbPort = 3306;
configurable string dbName = ?;
configurable string dbUsername = ?;
configurable string dbPassword = ?;
```

Local `Config.toml`:

```toml
dbHost = "localhost"
dbPort = 3306
dbName = "jobbridge"
dbUsername = "root"
dbPassword = "replace-with-local-password"
```

In Devant, the real database values should be supplied as runtime configurations and secrets.

## 5. Frontend Environment Configuration

Example `.env.example`:

```env
VITE_API_BASE_URL=http://localhost:9090
VITE_ASGARDEO_CLIENT_ID=replace-me
VITE_ASGARDEO_BASE_URL=https://api.asgardeo.io/t/replace-me
```

The frontend should use:

```javascript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
```

and call:

```javascript
fetch(`${API_BASE_URL}/api/jobs`);
```

For cloud deployment, point `VITE_API_BASE_URL` first to the Devant service URL, and later to the Bijira gateway URL.

## 6. Devant Deployment Sequence

1. Create a Devant project named `JobBridge`.
2. Connect the GitHub repository.
3. Import `job_board_api` as a WSO2 Integrator: BI integration.
4. Provision or connect a managed MySQL database.
5. Create the `jobbridge` schema and tables.
6. Add backend runtime configuration:
   - `dbHost`
   - `dbPort`
   - `dbName`
   - `dbUsername`
   - `dbPassword`
7. Deploy to Development.
8. Test the deployed API directly.
9. Promote a validated release to Production.

## 7. Frontend Deployment Sequence

1. Create a web application from `job-board-ui`.
2. Build using:

```bash
npm run build
```

3. Use output directory:

```text
dist
```

4. Configure:
   - `VITE_API_BASE_URL`
   - `VITE_ASGARDEO_CLIENT_ID`
   - `VITE_ASGARDEO_BASE_URL`
5. Deploy.
6. Confirm the public web URL.
7. Confirm the logo is reachable at:

```text
https://<jobbridge-web-host>/jobbridge-logo.png
```

## 8. Asgardeo Updates

After frontend deployment, add both local and cloud redirect URLs.

Example:

```text
http://localhost:5173
https://<jobbridge-web-host>
```

Update:

- Sign-in redirect URLs
- Sign-out redirect URLs
- Allowed origins when required
- Application branding logo URL

Logo URL:

```text
https://<jobbridge-web-host>/jobbridge-logo.png
```

## 9. Bijira API Management

After the Devant service is stable:

1. Create the JobBridge API in Bijira.
2. Use the Devant service URL as the backend.
3. Configure:
   - Name: `JobBridge API`
   - Context: `/jobbridge`
   - Version: `1.0`
4. Import or create an OpenAPI contract.
5. Apply OAuth security.
6. Configure scopes:
   - `jobs:read`
   - `jobs:write`
   - `organizations:register`
   - `admin:review`
7. Add throttling and policies.
8. Publish the API.
9. Point the React frontend to the Bijira gateway URL.

## 10. CORS

When frontend and API use different hosts, allow:

```text
http://localhost:5173
https://<jobbridge-web-host>
```

Do not use unrestricted `*` for authenticated production requests.

## 11. Environment Separation

Use separate Development and Production databases:

```text
jobbridge_dev
jobbridge_prod
```

Do not point both environments to the same database.

## 12. Production Readiness Checklist

- [ ] Access tokens validated
- [ ] Roles enforced by backend
- [ ] User identity derived from token
- [ ] Admin endpoints protected
- [ ] Organization ownership enforced
- [ ] Database credentials stored as secrets
- [ ] CORS restricted
- [ ] TLS used end to end
- [ ] Backups configured
- [ ] Logs and alerts enabled
- [ ] OpenAPI contract published
- [ ] Error responses standardized
- [ ] Audit records captured
