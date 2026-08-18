# JobBridge Deployment Guide

## 1. Deployment Strategy

Current platform layout:

| Concern | Platform |
|---|---|
| Frontend | WSO2 Developer Platform Web Application |
| Integration runtime | WSO2 Developer Platform / Devant / WSO2 Integrator |
| Database | Managed MySQL |
| Identity | Asgardeo |
| API management | Self-hosted WSO2 API Manager 4.7 on Google Compute Engine |
| API analytics | Moesif via API Manager analytics publisher |
| AI control plane | WSO2 AI Workspace |
| AI runtime gateway | WSO2 AI Gateway 1.2 on separate Google Compute Engine VM |
| LLM provider | OpenAI through WSO2 LLM Provider |
| Source control | GitHub |

The earlier WSO2 API Platform/Bijira proxy remains a lab artifact. The current deployed React application uses the self-hosted API Manager gateway as its active API ingress.

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

## 3. GitHub and Secret Handling

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

Do not commit:

- database credentials
- AI Gateway API keys
- OpenAI provider keys
- AI Gateway embedding-provider keys
- Asgardeo management-application client secret
- Moesif Collector Application ID if the repository is public and it is treated as an operational secret
- local private keys or certificates

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

Production values are supplied through runtime configuration/secrets.

## 5. Managed MySQL

The deployed database contains:

```text
jobbridge
├── jobs
└── organizations
```

The database schema must match the Ballerina SQL row types and queries. Runtime credentials are supplied by the platform rather than stored in GitHub.

## 6. Backend Deployment

1. Import/create the backend component from GitHub.
2. Set component directory to `/job_board_api`.
3. Use the Ballerina / WSO2 Integrator build preset.
4. Supply MySQL runtime values.
5. Supply `aiGatewayUrl` and secret `aiGatewayApiKey`.
6. Deploy to the target environment.
7. Verify direct backend operations before introducing API Manager.

Current Devant service base used by API Manager:

```text
https://b48cc93e-fa33-4420-a155-bc653b4d46be-my-env.e1-us-east-azure.choreoapis.dev/pablosu-jobbridge/jobboardapi/v1
```

## 7. Generate the OpenAPI Contract

From the backend package:

```bash
cd job_board_api
bal build --export-openapi
```

Generated file:

```text
target/openapi/api_openapi.yaml
```

Verify resources:

```bash
grep -nE '^  /|^    (get|post|put|delete|patch):' target/openapi/api_openapi.yaml
```

The generated contract is imported into API Manager so the proxy contains explicit JobBridge operations rather than wildcard `/*` resources.

## 8. Self-Hosted API Manager VM

Current lab runtime:

```text
Product: WSO2 API Manager 4.7.0
VM:      Google Compute Engine
Instance: apim-server
Region:   us-east1
Gateway HTTPS: 8243 internally
Management HTTPS: 9443 internally
Public ingress: 443 through Nginx
```

The VM uses a reserved static external IPv4 address. Public consumer traffic enters through Nginx. Do not intentionally expose `8243` or `9443` directly to the Internet.

### Start API Manager

```bash
cd ~/wso2/wso2am-4.7.0/bin
./api-manager.sh
```

### Management access through SSH tunnel

From the Mac:

```bash
gcloud compute ssh \
  --zone "us-east1-b" \
  "apim-server" \
  --project "wso2-apim-cicd" \
  -- -L 9443:localhost:9443 -L 8243:localhost:8243
```

Then use:

```text
https://localhost:9443/publisher
https://localhost:9443/devportal
https://localhost:9443/admin
```

For the tunnel-based management setup, `[server].hostname` is configured as `localhost`. The persisted `apim_publisher` OAuth callback was updated to use the localhost Publisher callback after the hostname change.

## 9. Create JobBridge API in Publisher

Import:

```text
target/openapi/api_openapi.yaml
```

Suggested API definition:

```text
Name:    JobBridge API
Context: /jobbridge
Version: 1.0
```

Production endpoint/target:

```text
https://b48cc93e-fa33-4420-a155-bc653b4d46be-my-env.e1-us-east-azure.choreoapis.dev/pablosu-jobbridge/jobboardapi/v1
```

The consumer gateway base becomes:

```text
https://<apim-public-ip>/jobbridge/1.0
```

Current lab value:

```text
https://35.231.59.214/jobbridge/1.0
```

## 10. Asgardeo Key Manager Integration

### Asgardeo management application

Create a separate confidential application, for example:

```text
API-Management-App
```

Authorize the required Asgardeo management APIs used by the connector, including API Resource Management, Dynamic Client Registration, and SCIM Roles management.

This application is separate from the browser `JobBridge` SPA.

### Global scope API resource

Create:

```text
Display Name: APIM_GLOBAL_SCOPES
Identifier:   /api/server/v1/scope-resource
```

Initially it can contain no scopes. API Manager synchronizes local API scopes into this resource.

### APIM Key Manager settings

In APIM Admin, add the Asgardeo Key Manager and use the Asgardeo tenant well-known configuration.

Important connector values include:

```text
Organization: pabloco
Global scopes resource: APIM_GLOBAL_SCOPES
API Resource Management endpoint:
  https://api.asgardeo.io/t/pabloco/api/server/v1/api-resources
Roles endpoint:
  https://api.asgardeo.io/t/pabloco/scim2/v2/Roles
Scope Management Endpoint: none
API Invocation Method: Direct Token
Token validation: Self validate JWT
Out Of Band Provisioning: enabled
```

A `403` while APIM fetches `APIM_GLOBAL_SCOPES` indicates the management application is missing the required Asgardeo management permission or the API Resource Management endpoint is incorrect.

## 11. Scopes and Resource Security

Create reusable Local Scopes in Publisher:

```text
jobs:write
organization:manage
admin
```

Assign:

```text
GET  /jobs
  security disabled / public

POST /ai/match-jobs
  security disabled / public

POST /jobs
  jobs:write

POST /organizations
GET  /organizations/me
  organization:manage

/admin/*
  admin
```

Saving the API after scope assignment synchronizes those scopes to `APIM_GLOBAL_SCOPES` in Asgardeo.

In Asgardeo, authorize `APIM_GLOBAL_SCOPES` to the JobBridge SPA and map permissions to application roles:

```text
MEMBER_ORGANIZATION
  jobs:write
  organization:manage

ADMIN
  jobs:write
  organization:manage
  admin
```

If an Asgardeo API resource is deleted/recreated, verify the role-permission assignments again because those permission references can be removed with the original resource.

## 12. Subscription and Existing SPA Client

Keep API subscriptions enabled.

1. Publish JobBridge API to DevPortal.
2. Create an APIM application named `JobBridge`.
3. Subscribe it to the JobBridge API.
4. Use the Asgardeo Key Manager.
5. Choose **Provide Existing OAuth Keys**.
6. Supply the existing Asgardeo JobBridge SPA client ID as Consumer Key.
7. Leave Consumer Secret blank because the SPA is a public PKCE client.

For out-of-band mapping without requiring a secret, add to the existing `[apim.key_manager]` section in `deployment.toml`:

```toml
[apim.key_manager]
enable_lightweight_apikey_generation = true
enable_provisioned_app_validation = false
service_url = "https://localhost:${mgt.transport.https.port}/services/"
```

Do not create a second `[apim.key_manager]` section.

## 13. Nginx Public Gateway

Nginx terminates public HTTPS and proxies to APIM Gateway `8243`.

Example:

```nginx
server {
    listen 80;
    server_name 35.231.59.214;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name 35.231.59.214;

    ssl_certificate /etc/letsencrypt/live/35.231.59.214/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/35.231.59.214/privkey.pem;

    location / {
        proxy_pass https://127.0.0.1:8243;
        proxy_ssl_verify off;
        proxy_ssl_server_name on;
        proxy_ssl_name localhost;

        proxy_set_header Host localhost;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

`proxy_ssl_verify off` is limited to the local Nginx-to-APIM hop because API Manager presents its local self-signed certificate. External clients receive the trusted public certificate from Nginx.

## 14. Let's Encrypt IP Certificate

The APIM VM uses a Let's Encrypt IP-address certificate with Certbot 5.7+.

ACME webroot:

```text
/var/www/certbot
```

Production request pattern:

```bash
sudo certbot certonly \
  --preferred-profile shortlived \
  --webroot \
  --webroot-path /var/www/certbot \
  --ip-address 35.231.59.214
```

Certificate files:

```text
/etc/letsencrypt/live/35.231.59.214/fullchain.pem
/etc/letsencrypt/live/35.231.59.214/privkey.pem
```

Add a deploy hook so Nginx reloads after renewal:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null <<'HOOK'
#!/bin/sh
systemctl reload nginx
HOOK
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

Short-lived IP certificates require reliable automated renewal.

## 15. Frontend Runtime Configuration

The deployed UI uses a runtime file mount for `config.js`:

```javascript
window.configs = {
  apiUrl: "https://35.231.59.214/jobbridge/1.0"
};
```

All deployed API traffic uses this single base URL, including `/ai/match-jobs`.

Public calls do not send a bearer token:

```text
GET  /jobs
POST /ai/match-jobs
```

Protected calls include:

```http
Authorization: Bearer <Asgardeo access token>
```

The deployed runtime file mount can override the file stored in GitHub. After changing the API base URL, update the WSO2 Developer Platform file mount and redeploy; otherwise the browser may continue calling the old `/choreo-apis/...` route.

## 16. Moesif Analytics

`deployment.toml`:

```toml
[apim.analytics]
enable = true
type = "moesif"

[apim.analytics.properties]
moesifKey = "<MOESIF_COLLECTOR_APPLICATION_ID>"
moesif_base_url = "https://api.moesif.net"
send_headers = false
send_payloads = false
payload_size_limit = 100000
capture_payloads_without_content_length = false
```

Use the **Moesif Collector Application ID**. A different Moesif management/API key can initialize the reporter but will not produce the expected event ingestion.

Useful verification:

```bash
grep -iE 'moesif|analytics' repository/logs/wso2carbon.log | tail -100
curl -v --max-time 10 https://api.moesif.net
```

Expected startup log:

```text
Initializing Moesif metric reporter
```

Only requests traversing APIM are expected in this Moesif analytics path.

## 17. AI Gateway Deployment

The AI Gateway remains on its own GCP VM.

```text
React -> APIM -> JobBridge backend -> AI Gateway -> OpenAI
```

The production App LLM Proxy uses:

```text
PII masking/redaction
Semantic Prompt Guard
Token Based Rate Limit: 2,000 total tokens / 60 seconds
```

The backend calls the AI proxy with `X-API-Key`; the browser never receives that key.

## 18. Observability

Use:

- Moesif for APIM gateway request analytics
- APIM `wso2carbon.log` for Key Manager/analytics errors
- WSO2 Developer Platform application logs for Ballerina/SQL/backend AI errors
- AI Workspace insights where available
- AI Gateway container logs on its GCP VM
- Nginx logs on both gateway VMs
- Google Cloud VM monitoring

## 19. End-to-End Deployment Sequence

```text
1. Managed MySQL available
2. AI Gateway VM healthy and Active
3. jobbridge-ai-prod deployed with AI policies
4. JobBridge backend deployed and direct endpoint tested
5. Ballerina OpenAPI contract generated
6. JobBridge API imported/configured in APIM
7. Asgardeo Key Manager connected
8. APIM scopes synchronized to APIM_GLOBAL_SCOPES
9. Asgardeo role-permission mappings verified
10. DevPortal JobBridge application subscribed + SPA client ID mapped OOB
11. Nginx + trusted TLS on APIM VM
12. Public APIM curl tests pass
13. Frontend runtime config.js updated to APIM URL
14. Frontend redeployed
15. Browser Network confirms APIM URL
16. Moesif confirms browser traffic traverses APIM
```

## 20. Production Readiness Checklist

- [x] Frontend deployed
- [x] Backend integration deployed
- [x] Managed MySQL connected
- [x] Asgardeo OIDC login working
- [x] AI Job Matcher implemented
- [x] WSO2 AI Gateway deployed and governed
- [x] Ballerina OpenAPI contract generated
- [x] Self-hosted API Manager 4.7 deployed
- [x] Asgardeo configured as APIM Key Manager
- [x] `jobs:write`, `organization:manage`, `admin` synchronized
- [x] Resource-level OAuth scopes configured
- [x] Public `/jobs` and `/ai/match-jobs` configured
- [x] APIM Developer Portal subscription configured
- [x] Existing Asgardeo SPA client mapped using OOB provisioning
- [x] Nginx public HTTPS configured for APIM
- [x] Trusted Let's Encrypt IP certificate configured
- [x] React routes all backend traffic through APIM
- [x] Moesif analytics ingesting APIM requests
- [ ] Prevent direct backend bypass of APIM
- [ ] Derive ownership from validated token identity
- [ ] Automate `MEMBER_ORGANIZATION` role assignment
- [ ] Production backup/alerting/auditing finalized
