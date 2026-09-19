/**
 * account-delete Edge Function — permanently deletes the caller's account
 * and, via ON DELETE CASCADE across every owned table, every project they
 * own. This is deliberately NOT something the client can do directly: only
 * the service role can call `auth.admin.deleteUser`, and we want an audit
 * record written first no matter what.
 *
 * Deploy: `supabase functions deploy account-delete`
 */
import { AssistantError } from "@inkwell/ai-contracts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabaseClients.ts";
import { statusForErrorCode } from "../_shared/errors.ts";

async function handleRequest(req: Request): Promise<Response> {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") throw new AssistantError("invalid_request", "Only POST is supported.");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new AssistantError("unauthorized", "Missing Authorization header.");

    const userClient = createUserClient(authHeader);
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) throw new AssistantError("unauthorized", "Invalid or expired session.");

    const serviceClient = createServiceClient();

    // Written before deletion: audit_events.user_id is ON DELETE SET NULL,
    // so the row survives the account being gone, preserving "an account
    // was deleted" in the log even though it can no longer be attributed to
    // a live user id.
    await serviceClient.from("audit_events").insert({
      user_id: user.id,
      action: "account.delete",
      target_type: "user",
      target_id: user.id,
    });

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id);
    if (deleteError) throw new AssistantError("provider_error", deleteError.message);

    return jsonResponse({ success: true });
  } catch (err) {
    if (err instanceof AssistantError) {
      return jsonResponse({ error: err.message, code: err.code }, statusForErrorCode(err.code));
    }
    console.error("account-delete unhandled error:", err);
    return jsonResponse({ error: "Internal error." }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

export { handleRequest };
