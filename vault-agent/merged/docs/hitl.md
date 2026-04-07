# Human in the Loop (HITL)

Every financial action above a configurable threshold requires explicit human approval
before executing. No money moves without your say-so.

## Thresholds (configurable in .env)

| Action | Default threshold | Env var |
|--------|------------------|---------|
| Bank payment | $10 USD | `HITL_THRESHOLD_USD` |
| ETH transfer | 0.001 ETH | `WALLET_HITL_THRESHOLD_ETH` |
| Single tx max | $20 USD | `MAX_SINGLE_TX_USD` |
| Daily max | $50 USD | `MAX_DAILY_SPEND_USD` |

## Approval channels

**Telegram (primary)** — interactive inline keyboard buttons:
```
🟠 APPROVAL REQUIRED

Action: bank_payment
Description: Send $15 to alice@example.com: Invoice #123
Risk Level: HIGH

[✅ APPROVE]  [❌ DENY]
```

**HTTPS API** — for programmatic approval:
```bash
curl -k -X POST https://localhost:8443/hitl/REQUEST_ID \
  -H "Authorization: Bearer TOKEN" \
  -d '{"decision": "approve", "reason": "Looks good"}'
```

**Timeout** — if no decision within `HITL_TIMEOUT_SECONDS` (default 300s),
the action is automatically `DENIED` (configurable via `HITL_TIMEOUT_ACTION`).

## Risk levels

| Level | Triggers |
|-------|---------|
| `low` | Small amounts, whitelisted payees |
| `medium` | Send actions below threshold |
| `high` | Above HITL threshold |
| `critical` | Above single-tx limit, delete actions |

Critical actions also trigger an SMS backup notification.
