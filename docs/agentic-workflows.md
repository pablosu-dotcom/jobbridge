# JobBridge Agentic Workflows with Arazzo and MCP

## 1. Purpose

This document describes the JobBridge agentic workflow proof of concept built with OpenAPI, Arazzo, WSO2 Arazzo tooling, and the Model Context Protocol (MCP). The goal is to expose a business-level JobBridge capability to an AI agent without requiring the agent to manually orchestrate every underlying API call.

The implemented capability is:

```text
publishJob
  1. Create a pending job
  2. Capture the returned job ID
  3. Approve that exact job
```

This is intentionally more than a one-to-one API wrapper: the Arazzo workflow composes two JobBridge API operations and passes runtime data between them.

## 2. Source API Contract

The Ballerina service generates its OpenAPI contract code-first:

```bash
cd job_board_api
bal build --export-openapi
```

Generated contract:

```text
target/openapi/api_openapi.yaml
```

Relevant operation IDs:

```text
POST /jobs
  operationId: postJobs

PUT /admin/jobs/{id}/approve
  operationId: putAdminJobsIdApprove
```

`POST /jobs` returns a payload that includes the new job identifier and lifecycle status, for example:

```json
{
  "id": "de83bb03-0a38-414b-8079-f0f87f22bba4",
  "title": "Integration Developer",
  "organization": "pabloco",
  "location": "Miami, FL",
  "employmentType": "Full-time",
  "description": "Integration developer with Ballerina knowledge.",
  "applyUrl": "http://example.com",
  "status": "PENDING"
}
```

## 3. Repository Layout

```text
job_board_api/
├── workflows/
│   ├── publish-job.arazzo.yaml
│   └── api_openapi.yaml
├── target/
│   └── openapi/
│       └── api_openapi.yaml
└── ...
```

`target/openapi/api_openapi.yaml` remains the generated Ballerina contract. `workflows/api_openapi.yaml` is a local workflow/MCP copy used for packaging and Docker-host connectivity.

Generated MCP artifacts should normally be treated as build output rather than source and can be regenerated from the Arazzo/OpenAPI files.

## 4. Arazzo Workflow

The workflow uses Arazzo `1.0.1`, which matches the WSO2 Arazzo Visualizer/LSP version support used during implementation.

Core workflow:

```yaml
arazzo: 1.0.1

info:
  title: JobBridge Job Submission Workflow
  version: 1.0.0

sourceDescriptions:
  - name: jobBridgeApi
    url: ./api_openapi.yaml
    type: openapi

workflows:
  - workflowId: publishJob
    summary: Create and approve a JobBridge job posting

    inputs:
      type: object
      required:
        - title
        - organization
        - location
        - employmentType
        - description
        - applyUrl
      properties:
        title:
          type: string
        organization:
          type: string
        location:
          type: string
        employmentType:
          type: string
        description:
          type: string
        applyUrl:
          type: string

    steps:
      - stepId: createJob
        operationId: postJobs
        requestBody:
          contentType: application/json
          payload:
            title: $inputs.title
            organization: $inputs.organization
            location: $inputs.location
            employmentType: $inputs.employmentType
            description: $inputs.description
            applyUrl: $inputs.applyUrl
        successCriteria:
          - condition: $statusCode == 201
        outputs:
          jobId: $response.body#/id
          jobStatus: $response.body#/status

      - stepId: approveJob
        operationId: putAdminJobsIdApprove
        parameters:
          - name: id
            in: path
            value: $steps.createJob.outputs.jobId
        successCriteria:
          - condition: $statusCode == 202

    outputs:
      jobId: $steps.createJob.outputs.jobId
```

The important composition is:

```text
$response.body#/id
       |
       v
createJob.outputs.jobId
       |
       v
approveJob path parameter id
```

## 5. WSO2 Arazzo Visualizer

The WSO2 Arazzo Visualizer extension for VS Code was used to:

- Render the workflow visually.
- Validate the Arazzo document.
- Execute the workflow through **Try with curl**.
- Confirm that `createJob` and `approveJob` execute in sequence.

The local Ballerina server is normally available at:

```text
http://localhost:9090/api
```

The visualizer's local runner exposes a temporary local `/run/{workflowId}` endpoint while executing a workflow. The generated curl targets that runner, and the runner then invokes the API operations described by Arazzo/OpenAPI.

## 6. MCP Generation

The official WSO2 generator is used:

```text
Repository: wso2/arazzo-mcp-generator
CLI:        arazzo-mcp-gen
Version:    v0.1.0
```

Validate and inspect:

```bash
arazzo-mcp-gen validate -f workflows
arazzo-mcp-gen inspect -f workflows
```

Generate the MCP server:

```bash
arazzo-mcp-gen mcp-server generate \
  -f workflows \
  -p 5000 \
  -o workflows/artifacts
```

The generated MCP server exposes `publishJob` as an MCP tool.

## 7. Docker Connectivity on macOS

The MCP server runs in Docker, while the Ballerina JobBridge API runs on the macOS host. Inside the container, `localhost:9090` refers to the container itself, not the Mac.

The workflow-specific OpenAPI copy therefore uses:

```yaml
servers:
  - url: "http://host.docker.internal:9090/api"
```

The generated image listens on container port `5000`. On the development Mac, host port `5001` is used to avoid a local port-5000 conflict:

```bash
docker run --rm \
  -p 5001:5000 \
  jobbridge-job-submission-workflow-mcp-server
```

MCP endpoint from the Mac:

```text
http://localhost:5001/mcp
```

## 8. MCP Inspector Test

Launch MCP Inspector:

```bash
npx -y @modelcontextprotocol/inspector http://localhost:5001/mcp
```

The Inspector discovers the `publishJob` tool and its six business inputs. A successful invocation executes the Arazzo steps and creates/approves the new JobBridge job.

End-to-end path:

```text
MCP Inspector
     |
     v
publishJob MCP tool
     |
     v
Arazzo publishJob workflow
     |
     +--> POST /jobs
     |      -> 201
     |      -> jobId
     |
     +--> PUT /admin/jobs/{jobId}/approve
            -> 202
     |
     v
JobBridge / MySQL
```

## 9. Troubleshooting Findings

### Qualified operation IDs were not resolved by the generated runner

The VS Code workflow initially used values such as:

```yaml
operationId: $sourceDescriptions.jobBridgeApi.postJobs
```

The generated MCP runner reported that the operation could not be found. Because the workflow uses one unambiguous OpenAPI source, the working form is the plain OpenAPI operation ID:

```yaml
operationId: postJobs
```

and:

```yaml
operationId: putAdminJobsIdApprove
```

### Parameterized OpenAPI server URL returned 404 in the MCP runtime

The generated Ballerina contract uses:

```yaml
servers:
  - url: "http://{server}:{port}/api"
```

The parameterized form worked in the VS Code Arazzo Visualizer. In the generated Docker MCP runtime, the create step returned `404` even though direct GET and POST requests from the same container to `host.docker.internal:9090/api/jobs` succeeded.

The local MCP copy was changed to the explicit URL:

```yaml
servers:
  - url: "http://host.docker.internal:9090/api"
```

After rebuilding the MCP image, the workflow completed and the job was persisted.

### Workflow-complete result can be misleading without checking logs

During an earlier failure, the MCP response reported `workflow_complete` even though container logs showed step-resolution errors. For this version of the tooling, validate successful side effects and inspect container logs when behavior is unexpected.

## 10. Security and Governance Boundary

The current MCP proof of concept is deliberately local. It calls the JobBridge Ballerina API directly and therefore bypasses the self-hosted API Manager path used by the deployed React application.

Current local MCP path:

```text
MCP client -> MCP server -> local JobBridge API -> MySQL
```

Target governed agent path:

```text
AI agent
   |
   | authenticated agent identity
   v
MCP / skill layer
   |
   v
WSO2 API Manager
   - OAuth/JWT validation
   - least-privilege scopes
   - subscription/governance
   - analytics/auditing
   |
   v
JobBridge API
```

`publishJob` includes an administrative approval operation, so a production implementation should not expose it to a general-purpose agent without explicit authorization. The agent should be treated as a first-class identity and granted only the scopes required for the approved business function. Human approval or a narrower workflow may be preferable depending on the use case.

## 11. Relationship Between OpenAPI, Arazzo, MCP, Skills, and Agents

```text
OpenAPI
  Describes individual API operations and schemas
        |
        v
Arazzo
  Describes how operations compose into a business workflow
        |
        v
MCP tool
  Makes the workflow discoverable/invocable by an AI client
        |
        v
AI skill
  Adds business instructions, policy, context, and reusable procedure
        |
        v
AI agent
  Decides when to use the capability to satisfy user intent
```

For JobBridge, `postJobs` and `putAdminJobsIdApprove` are primitive API operations. `publishJob` is the composed workflow. The generated MCP server exposes that workflow as an agent-callable tool.

## 12. Next Steps

1. Connect an AI agent/client to `http://localhost:5001/mcp` and demonstrate natural-language selection of `publishJob`.
2. Route the agent execution path through API Manager rather than directly to the local backend.
3. Define an agent identity and least-privilege scope model.
4. Add auditing that records which human/agent initiated each published job.
5. Decide whether administrative approval should remain inside `publishJob` or be separated when human-in-the-loop governance is required.
6. Re-test OpenAPI server-variable support and workflow output reporting as the Arazzo MCP tooling evolves.
