# JobBridge AI Job Matching

## 1. Objective

The AI Job Matcher adds AI-assisted job discovery without exposing LLM credentials to the browser. A job seeker enters a short profile describing experience, skills, location, and preferred work. JobBridge ranks currently active jobs and returns concise explanations.

The matcher is advisory: it helps users explore available jobs; it is not an automated hiring or eligibility decision.

## 2. User Experience

```text
Tell us about yourself
[ I have five years of customer service experience ... ]

[ Find Matching Jobs ]

80%  Administrative Assistant
     Example Organization
     Coral Gables, FL
     Strong match because...
```

The normal job list remains available independently of AI recommendations.

## 3. Application Flow

```text
React
  |
  | POST /ai/match-jobs
  | public resource
  v
WSO2 API Manager 4.7
  |
  | public ingress + analytics
  v
WSO2 Integrator / Ballerina
  |
  +--> getActiveJobs() --> Managed MySQL
  |
  +--> Build trusted system message
  |      - JobBridge matching instructions
  |      - ACTIVE jobs JSON
  |      - JSON response contract
  |
  +--> Add candidate profile as final user message
  |
  v
WSO2 AI Gateway 1.2 / jobbridge-ai-prod
  |
  +--> PII masking/redaction
  +--> Semantic Prompt Guard (deny-list)
  +--> Token Based Rate Limit
  |      2,000 total tokens / 60 seconds (demo setting)
  |
  v
OpenAI gpt-4o-mini
  |
  v
Typed JobBridge response
  |
  v
React joins jobId to already-loaded jobs
```

API Manager is the application/API ingress. AI Gateway is the downstream LLM governance layer. AI Workspace remains the AI control plane.

## 4. Public API Exposure

The deployed browser calls:

```text
https://35.231.59.214/jobbridge/1.0/ai/match-jobs
```

This operation currently has API Manager security disabled so it is public, matching `GET /jobs`.

The downstream AI Gateway is still protected by `X-API-Key` and the configured AI policies. React never receives that key.

## 5. Request Contract

```json
{
  "profile": "I have five years of customer service experience, enjoy helping people, and want part-time work in Coral Gables."
}
```

## 6. LLM Request Structure

JobBridge separates trusted application instructions from untrusted candidate input:

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "system",
      "content": "JobBridge instructions + ACTIVE jobs + response contract"
    },
    {
      "role": "user",
      "content": "<candidate profile>"
    }
  ]
}
```

The Semantic Prompt Guard evaluates the final user message (`$.messages[-1].content`) rather than the trusted system message.

## 7. Response Contract

```json
{
  "matches": [
    {
      "jobId": "job-002",
      "score": 80,
      "reason": "The role aligns with the candidate's experience and location preference."
    }
  ]
}
```

The prompt instructs the model to use only supplied jobs, score from 0-100, return only scores of 60 or higher, return at most 5 matches, sort strongest first, and return JSON only.

## 8. Off-Topic and Guardrail Behavior

```text
Candidate input
   |
   +--> Semantic Prompt Guard recognizes denied intent
   |       -> AI Gateway 422
   |       -> JobBridge friendly out-of-scope response
   |
   +--> Semantic guard does not match
           -> request reaches model
           -> system prompt forbids unrelated tasks
           -> unrelated input returns {"matches": []}
```

This avoids relying on the semantic guardrail as a perfect classifier.

## 9. Implemented AI Gateway Policies

### PII masking/redaction

Applied before upstream LLM processing so candidate-supplied personal information can be obscured before it reaches the provider.

### Semantic Prompt Guard

Uses an embedding provider configured on the AI Gateway and evaluates only the final user message. The gateway embedding configuration uses OpenAI `text-embedding-3-small`.

### Token Based Rate Limit

Current demo policy:

```text
2,000 total tokens / 60 seconds
```

This is an aggregate prompt + completion token quota during the time window. It is not a per-request 2,000-token limit.

## 10. Backend Implementation

The AI resource:

1. Validates that `payload.profile` is not empty.
2. Calls `getActiveJobs()`.
3. Converts active jobs to JSON text.
4. Builds the trusted system prompt.
5. Sends `payload.profile` as the final user message.
6. Calls `<aiGatewayUrl>/chat/completions` using `X-API-Key`.
7. Handles non-2xx gateway responses explicitly.
8. Preserves Semantic Prompt Guard interventions as HTTP `422`.
9. Converts successful `200` responses to typed records and parses `choices[0].message.content` into `MatchJobsResponse`.

## 11. API Manager Observability

Because `/ai/match-jobs` now enters through API Manager, its browser invocations can appear in Moesif alongside the rest of the JobBridge API traffic.

This provides application/API-level visibility before the request reaches the backend. AI Gateway/AI Workspace provides the downstream LLM-specific visibility and policies.

## 12. Credential Boundaries

```text
OpenAI model API key
  -> WSO2 LLM Provider

Embedding provider API key
  -> AI Gateway config.toml

App LLM Proxy API key
  -> job_board_api runtime secret

Moesif Collector Application ID
  -> APIM deployment.toml

React browser
  -> receives none of the AI provider/proxy keys
```

## 13. Operational Dependencies

AI matching requires:

- public APIM gateway available
- JobBridge backend available
- managed MySQL available
- AI Gateway VM available
- Nginx/public TLS healthy on the AI Gateway VM
- Active AI Workspace gateway registration
- deployed `jobbridge-ai-prod`
- valid App LLM Proxy key
- embedding provider used by Semantic Prompt Guard
- OpenAI LLM Provider available

The rest of JobBridge can continue to serve normal jobs when AI matching is unavailable.

## 14. Responsible Use

The JobBridge score is advisory. The matcher should not infer or use protected characteristics, and users can browse all active jobs independently of AI recommendations.
