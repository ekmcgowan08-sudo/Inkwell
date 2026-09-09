import type { LLMProvider } from "../contracts.js";

/**
 * SERVER-ONLY. This provider takes a real Anthropic API key and must only ever
 * be instantiated inside `supabase/functions/ai-assistant` (a Deno Edge
 * Function), reading the key from `Deno.env`. Never import this from
 * `apps/web`, `apps/desktop`, or `apps/mobile` — a distributed client must
 * never hold an Anthropic key. See docs/AI_ARCHITECTURE.md and docs/SECURITY.md.
 *
 * The model id is intentionally NOT hardcoded to a specific historical
 * snapshot. It is read from `ANTHROPIC_MODEL` (falling back to
 * `DEFAULT_ANTHROPIC_MODEL` below) so an operator can upgrade it via
 * environment configuration without a code change, per the brief's
 * requirement to validate against current official Anthropic documentation
 * rather than a remembered version. Verify the configured id against
 * https://docs.claude.com/en/docs/about-claude/models before going live.
 */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
export const ANTHROPIC_API_VERSION = "2023-06-01";
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export interface AnthropicProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export function createAnthropicProvider(config: AnthropicProviderConfig): LLMProvider {
  const model = config.model?.trim() || DEFAULT_ANTHROPIC_MODEL;
  const url = config.baseUrl ?? ANTHROPIC_MESSAGES_URL;

  return {
    name: `anthropic:${model}`,
    async complete({ system, user, maxTokens = 1024 }) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 500)}`);
      }

      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const text = (data.content ?? [])
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text as string)
        .join("\n")
        .trim();

      return {
        text: text || "No response.",
        usage: {
          tokensInput: data.usage?.input_tokens ?? 0,
          tokensOutput: data.usage?.output_tokens ?? 0,
        },
      };
    },
  };
}
