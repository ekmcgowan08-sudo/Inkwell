import type { AssistantErrorCode } from "@inkwell/ai-contracts";

/**
 * Maps every AssistantError code to its HTTP status. Was duplicated verbatim in both
 * ai-assistant/index.ts and account-delete/index.ts's catch blocks — extracted here so it's
 * defined once and testable in isolation without needing to mock either function's Supabase
 * clients (see errors.test.ts).
 */
const STATUS_BY_CODE: Record<AssistantErrorCode, number> = {
  unauthorized: 401,
  project_not_found: 404,
  ai_disabled_for_project: 403,
  rate_limited: 429,
  usage_allowance_exceeded: 429,
  provider_error: 502,
  invalid_request: 400,
};

export function statusForErrorCode(code: AssistantErrorCode): number {
  return STATUS_BY_CODE[code];
}
