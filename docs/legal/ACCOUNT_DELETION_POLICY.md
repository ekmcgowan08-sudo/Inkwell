> **DRAFT — NOT LEGAL ADVICE, NOT REVIEWED BY A LAWYER.** See `docs/LEGAL_REVIEW_CHECKLIST.md`.

# Account Deletion Policy (Draft)

## Project deletion

Deleting a single book/project (Book Settings → Delete this book, or the Dashboard's delete action) is
**soft**: the project moves to a 30-day recovery window (`deleted_items` table) before permanent removal. You
can restore it yourself during that window (Versions & Backups → Recovery bin). [The automated job that
permanently purges data past the 30-day window is not yet built — see `docs/OWNER_ACTIONS_REQUIRED.md`; until
it exists, deleted data may persist longer than 30 days in practice. This policy must reflect actual behavior,
not intended behavior, before publication.]

## Account deletion

Deleting your entire account (Account Settings → Delete account) is **immediate and permanent** — there is no
recovery window at the account level. This calls a server-side function (`supabase/functions/account-delete`)
that removes your user record and, via database cascade rules, every project and all data you own. An audit
record that an account was deleted is retained (without personal identifying information attached, since the
user reference is cleared) for security/compliance purposes.

## What is NOT deleted

- Aggregated, de-identified data that cannot be traced back to you (if any exists at the time of deletion —
  none is currently collected as of this writing).
- Data we're legally required to retain for a defined period (e.g., financial records related to a
  subscription payment) — [specific retention periods TBD by legal review based on applicable tax/financial
  regulations].

## How to request deletion

Self-service, in-app (Account Settings), at any time, no support request needed. If you're unable to access
your account, contact [support email — TBD].
