> **DRAFT — NOT LEGAL ADVICE, NOT REVIEWED BY A LAWYER.** See `docs/LEGAL_REVIEW_CHECKLIST.md`.

# Data Retention Policy (Draft)

| Data                                                   | Retention                                                                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Active project content (manuscript, story bible, etc.) | Retained as long as your account and that project exist                                                                             |
| Soft-deleted projects                                  | 30-day recovery window, then intended permanent deletion — automated purge job not yet built (see `docs/OWNER_ACTIONS_REQUIRED.md`) |
| Document revision history                              | Retained indefinitely alongside the project (append-only; no automatic pruning of old revisions implemented)                        |
| AI conversation history                                | Retained as long as the project exists; deleted with the project                                                                    |
| AI usage records (`ai_usage`)                          | Retained indefinitely for billing/allowance purposes; no automatic pruning implemented                                              |
| Audit events                                           | Retained indefinitely for security purposes; contain no manuscript content                                                          |
| Account, once deleted                                  | Immediately and permanently removed, per `docs/legal/ACCOUNT_DELETION_POLICY.md`                                                    |
| Backups (infrastructure-level, via Supabase)           | Governed by Supabase's own backup retention policy for your plan tier — not controlled by Inkwell's application code                |

## Why some retention periods aren't finalized

This is a genuinely engineering-incomplete area, stated honestly rather than glossed over: several "should
eventually be pruned" categories above (old document revisions, AI usage records past a billing period,
long-since-soft-deleted projects) have no scheduled job removing them yet. This document should be updated
to reflect real, implemented behavior — either by building the pruning jobs, or by adjusting the stated
retention periods to match reality — before publication.
