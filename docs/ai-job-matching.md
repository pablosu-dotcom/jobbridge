# JobBridge AI Job Matching

## 1. Objective

The AI Job Matcher adds a useful AI capability to JobBridge without exposing LLM credentials to the browser.

A job seeker enters a short profile describing experience, skills, location, and preferred work. JobBridge ranks currently active jobs and returns concise explanations.

## 2. User Experience

```text
Tell us about yourself
[ I have five years of customer service experience ... ]

[ Find Matching Jobs ]

80%  Administrative Assistant
     Example Organization
     Coral Gables, FL
     Strong match because...

60%  QA Tester
     ...
```

The normal job list remains available below the AI recommendations.

## 3. Application Flow

```text
React
  |
  | POST /api/ai/match-jobs
  v
WSO2 Integrator / Ballerina
  |
  +--> getActiveJobs()
  |      |
  |      v
  |    MySQL
  |
  +--> Build prompt
  |
  v
WSO2 AI Gateway
App LLM Proxy: jobbridge-ai-prod
  |
  v
OpenAI
gpt-4o-mini
  |
  v
Typed JobBridge response
  |
  v
React joins jobId to loaded jobs
```

## 4. Request Contract

```json
{
  "profile": "I have five years of customer service experience, enjoy helping people, and want part-time work in Coral Gables."
}
```

## 5. Response Contract

```json
{
  "matches": [
    {
      "jobId": "job-002",
      "score": 80,
      "reason": "The part-time Administrative Assistant role aligns well with the candidate's experience and location preference."
    }
  ]
}
```

## 6. Matching Rules

The prompt instructs the model to:

- Use only jobs provided by JobBridge.
- Score matches from 0 to 100.
- Return only jobs scoring 60 or above.
- Return at most 5 matches.
- Order strongest matches first.
- Explain each match briefly.
- Return JSON only in the required structure.

## 7. Backend Implementation

A reusable `getActiveJobs()` project function queries MySQL and maps database rows into `Job[]`.

The AI resource then:

1. Gets active jobs.
2. Converts jobs to JSON text.
3. Builds the LLM prompt.
4. Calls:
   ```http
   POST <aiGatewayUrl>/chat/completions
   ```
5. Sends:
   ```http
   X-API-Key: <aiGatewayApiKey>
   ```
6. Binds the OpenAI-compatible response to typed records.
7. Parses `choices[0].message.content` into `MatchJobsResponse`.

## 8. AI Gateway Design

### Development

```text
jobbridge-ai-proxy
-> local WSO2 AI Gateway
-> https://localhost:8443
```

### Production

```text
jobbridge-ai-prod
-> jobbridge-cloud-gateway
-> Google Compute Engine VM
-> Nginx public HTTPS
-> WSO2 AI Gateway 1.2
-> OpenAI Provider
```

AI Workspace acts as the control plane. The gateway runtime is self-hosted.

## 9. Credential Boundaries

```text
OpenAI API key
  -> stored in WSO2 LLM Provider

App LLM Proxy API key
  -> stored as job_board_api runtime secret

React browser
  -> receives neither key
```

## 10. Operational Dependencies

AI matching requires:

- managed MySQL available
- GCP AI Gateway VM running
- Nginx/public TLS healthy
- AI Gateway registered/Active in AI Workspace
- production App LLM Proxy deployed
- valid proxy API key
- OpenAI provider available

The rest of JobBridge can continue to serve normal jobs even if the AI matcher is unavailable, assuming the UI handles the matcher error independently.

## 11. AI Governance Next Steps

Recommended additions:

- Prompt-injection/content guardrail
- Rate limit/token quota for matching requests
- Input/output size limits
- AI usage/cost monitoring
- Request/response observability with sensitive-data review
- Timeout and fallback behavior
- Model/provider abstraction for future provider changes

## 12. Responsible Use

The JobBridge score is advisory. It is intended to help users explore jobs, not make hiring or eligibility decisions. The matcher should not infer or use protected characteristics, and the application should continue to let users browse all active jobs independently of AI recommendations.

