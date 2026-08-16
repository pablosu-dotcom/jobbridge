# JobBridge Deployment Guide

## 1. Deployment Strategy

Current platform layout:

| Concern | Platform |
|---|---|
| Frontend | WSO2 Developer Platform Web Application |
| Integration runtime | WSO2 Developer Platform / WSO2 Integrator |
| Database | Managed MySQL |
| Identity | Asgardeo |
| AI control plane | WSO2 AI Workspace |
| AI runtime gateway | WSO2 AI Gateway 1.2 on Google Compute Engine |
| LLM provider | OpenAI through WSO2 LLM Provider |
| API management lab | WSO2 API Platform / Bijira |
| Source control | GitHub |

The frontend and backend are separate Developer Platform components created from the same monorepo.

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

Using the correct component directory is important for buildpack behavior.

## 3. GitHub Preparation

Recommended `.gitignore` entries include:

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

Do not commit database credentials, AI Gateway API keys, OpenAI credentials, or local secrets.

## 4. Backend Configurables

Current runtime values include:

```ballerina
configurable string mysqlUser = ?;
configurable string mysqlHost = ?;
configurable string mysqlPassword = ?;
configurable string mysqlDatabase = ?;
configurable int mysqlPort = ?;

configurable string aiGatewayUrl = ?;
configurable string aiGatewayApiKey = ?;
```

Production values:

```text
mysql*            -> managed MySQL runtime configuration/secrets
aiGatewayUrl      -> production App LLM Proxy base URL
aiGatewayApiKey   -> secret
```

Example production AI URL:

```text
https://<ai-gateway-public-host-or-ip>/jobbridge/jobbridge-ai-prod
```

The code appends `/chat/completions`, so `aiGatewayUrl` must be the proxy base URL rather than the full chat-completions path.

## 5. Managed MySQL

The deployed database contains:

```text
jobbridge
├── jobs
└── organizations
```

The database schema must match the Ballerina SQL row types and queries.

Runtime credentials are supplied by the platform rather than stored in GitHub.

## 6. AI Workspace Configuration

### LLM Provider

An OpenAI LLM Provider is configured in an AI Workspace organization controlled by the project owner.

The upstream OpenAI API key is stored in the LLM Provider and is never exposed to JobBridge.

### App LLM Proxies

Recommended separation:

```text
Development:
  jobbridge-ai-proxy
  -> local AI Gateway

Production:
  jobbridge-ai-prod
  -> jobbridge-cloud-gateway
```

The backend uses an App LLM Proxy API key through:

```http
X-API-Key: <proxy-key>
```

Generate the key after the proxy is deployed to the intended gateway.

## 7. Production AI Gateway on Google Cloud

### VM

The production runtime uses a dedicated Google Compute Engine VM.

Recommended baseline:

```text
Machine type: e2-standard-2
OS: Ubuntu LTS
Static external IPv4
Docker Engine + Docker Compose
```

### Gateway registration

In AI Workspace:

```text
Name: jobbridge-cloud-gateway
Environment: Production
URL: https://<static-public-ip-or-hostname>
```

Use the gateway-specific registration instructions/token from AI Workspace.

The working runtime is WSO2 AI Gateway **1.2.x**.

### Runtime ports

Keep gateway internal/admin ports private. Public traffic should enter through standard HTTPS.

```text
Internet :443
    |
    v
Nginx
    |
    | http://127.0.0.1:8080
    v
WSO2 AI Gateway
```

### TLS

Nginx terminates TLS with a publicly trusted certificate.

If using a public IP directly, the current implementation uses a Let's Encrypt IP-address certificate. These certificates are short-lived, so automatic renewal must remain enabled and Nginx should reload when renewed.

Do not disable TLS verification in the deployed Ballerina client.

### Health

On the VM:

```bash
docker compose ps
curl http://localhost:9094/api/admin/v1/health
```

The AI Workspace gateway status should show `Active`.

### Direct gateway test

Before Nginx:

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

### Public gateway test

Then test public HTTPS without `-k`:

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

## 8. Backend Deployment

1. Import/create the backend component from GitHub.
2. Set component directory:
   ```text
   /job_board_api
   ```
3. Use the Ballerina / WSO2 Integrator build preset.
4. Supply MySQL runtime values.
5. Supply:
   ```text
   aiGatewayUrl
   aiGatewayApiKey
   ```
6. Keep `aiGatewayApiKey` as a secret.
7. Do not mount an additional certificate when the AI Gateway presents a publicly trusted certificate.
8. Deploy the backend.
9. Verify:
   ```http
   GET /api/jobs
   POST /api/ai/match-jobs
   ```

Example AI test:

```json
{
  "profile": "I have five years of customer service experience and want part-time work in Coral Gables."
}
```

Expected shape:

```json
{
  "matches": [
    {
      "jobId": "...",
      "score": 80,
      "reason": "..."
    }
  ]
}
```

## 9. Frontend Web Application

Create the Web Application component from:

```text
/job-board-ui
```

Use:

```text
Build command: npm ci && npm run build
Build path:    dist
Node version:  20
```

WSO2 Developer Platform **Managed Authentication is disabled** because JobBridge already authenticates directly with Asgardeo.

## 10. UI-to-API Connection

Runtime file:

```text
job-board-ui/public/config.js
```

Example:

```javascript
window.configs = {
  apiUrl: "/choreo-apis/pablosu-jobbridge/jobboardapi/v1"
};
```

Shared API base resolution:

```javascript
export const API_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_API_BASE_URL || "/api"
  : window?.configs?.apiUrl ||
    import.meta.env.VITE_API_BASE_URL ||
    "/api";
```

Behavior:

```text
Local:
  /api -> Vite proxy -> http://127.0.0.1:9090

Deployed:
  /choreo-apis/pablosu-jobbridge/jobboardapi/v1
```

This prevents `public/config.js` from forcing a deployed `/choreo-apis/...` path during local Vite development.

## 11. Asgardeo OIDC

The SPA continues to use Asgardeo directly.

```javascript
const appUrl = window.location.origin;
```

Use the runtime origin for both sign-in and sign-out redirects.

Register both local and deployed origins in Asgardeo. Redirect URLs must match exactly, including trailing slash behavior.

## 12. Current API Security

The active deployed React-to-backend path uses the Developer Platform project connection.

For the MVP:

- Asgardeo authenticates the user to React.
- Developer Platform Managed Authentication is disabled.
- Backend OAuth2 enforcement is disabled.
- Server-side role/ownership enforcement remains a hardening item.

Separately, a WSO2 API Platform proxy has been tested successfully using the built-in STS for OAuth2 security. It is not currently the route used by the deployed UI.

## 13. Observability

Use:

- Developer Platform application logs for Ballerina runtime, SQL, and AI call errors
- Developer Platform gateway logs for component routing
- AI Workspace insights for AI traffic where available
- AI Gateway container logs on the GCP VM
- Nginx logs for public gateway ingress
- Google Cloud VM monitoring for runtime availability

Useful gateway commands:

```bash
docker compose ps
docker compose logs --tail=200
```

## 14. Deployment Sequence

Recommended order:

```text
1. AI Gateway VM healthy + Active in AI Workspace
2. OpenAI provider deployed to production gateway
3. jobbridge-ai-prod deployed and API key tested
4. job_board_api deployed and /ai/match-jobs tested
5. job-board-ui deployed
6. Full browser smoke test
```

## 15. Production Readiness Checklist

- [x] Frontend deployed
- [x] Backend integration deployed
- [x] Managed MySQL connected
- [x] Database credentials kept out of GitHub
- [x] Asgardeo OIDC login working
- [x] JobBridge logo configured in Asgardeo
- [x] UI-to-API project connection working
- [x] AI Job Matcher implemented
- [x] WSO2 AI Gateway deployed to GCP
- [x] AI App LLM Proxy working through public HTTPS
- [x] AI Gateway API key kept server-side
- [x] Deployed `/api/ai/match-jobs` tested successfully
- [ ] AI Gateway guardrails/policies configured
- [ ] AI observability demo finalized
- [ ] Access tokens validated by application API layer
- [ ] Roles enforced server-side
- [ ] User identity derived from validated token
- [ ] Admin endpoints protected server-side
- [ ] Organization ownership enforced server-side
- [ ] Production backups configured
- [ ] Logs/alerts operationalized
- [ ] OpenAPI contract governed
- [ ] Audit records captured
- [ ] Decide whether deployed UI should route through API Platform

