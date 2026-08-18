# JobBridge AI Guardrails Summary

Implemented on `jobbridge-ai-prod`:

| Control | Purpose | Current behavior |
|---|---|---|
| PII masking/redaction | Reduce exposure of candidate PII to the LLM provider | Applied in AI Gateway request path |
| Semantic Prompt Guard | Block recognized off-topic/prompt-injection style requests | Deny-list strategy; evaluates `$.messages[-1].content`; intervention returns `422` |
| Token Based Rate Limit | Bound aggregate AI consumption | `2,000` total tokens per `60` seconds for demo/testing |
| System-prompt fallback | Handle unrelated input that is not semantically blocked | Returns `{"matches": []}` instead of unrelated prose |

The semantic policy uses OpenAI `text-embedding-3-small` through gateway-level embedding-provider configuration.

The token quota is deliberately low for demonstration and should be tuned using actual JobBridge prompt/completion usage in AI Workspace Insights.
