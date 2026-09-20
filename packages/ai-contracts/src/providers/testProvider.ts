import type { LLMProvider } from "../contracts.ts";

/**
 * Deterministic local AI provider. No network call, no API key, no cost.
 * Used by unit/integration tests and local dev when `ANTHROPIC_API_KEY` is
 * unset, so the rest of the app (context assembly, citation rendering,
 * usage tracking, findings workflow) can be exercised without spending real
 * API credits — per the brief's requirement for a deterministic test adapter.
 *
 * Behavior is intentionally simple and stable: it never calls out to
 * anything, and the same input always produces the same output.
 */
export function createTestProvider(): LLMProvider {
  return {
    name: "test-deterministic",
    async complete({ system, user }) {
      const scenarioMatch = user.match(/TEST_SCENARIO:(\S+)/);
      const scenario = scenarioMatch?.[1];

      let text: string;
      if (scenario === "findings") {
        text =
          'Based on the provided context, there is a possible contradiction worth tracking. [test-provider deterministic response]\n\n===FINDINGS_JSON===\n[{"findingType":"contradiction","severity":"medium","confidence":0.75,"title":"Possible contradiction found by the test provider","explanation":"A deterministic test finding, not real model reasoning."}]\n===END_FINDINGS_JSON===';
      } else if (scenario === "findings-empty") {
        text =
          "Nothing concrete enough to track was found. [test-provider deterministic response]\n\n===FINDINGS_JSON===\n[]\n===END_FINDINGS_JSON===";
      } else if (scenario === "contradiction") {
        text =
          "Based on the provided context, there is a possible contradiction: the same detail is described two different ways in the material supplied. [test-provider deterministic response]";
      } else if (scenario === "not-established") {
        text = "That has not been established anywhere in the material provided. [test-provider deterministic response]";
      } else if (scenario === "empty-context") {
        text = "I don't have any manuscript or story-bible content for this project yet. [test-provider deterministic response]";
      } else {
        text = `Reviewed the provided context (${countContextLines(system)} reference item(s)) and the question: "${truncate(
          user,
          120,
        )}". [test-provider deterministic response]`;
      }

      return {
        text,
        usage: {
          tokensInput: approxTokenCount(system) + approxTokenCount(user),
          tokensOutput: approxTokenCount(text),
        },
      };
    },
  };
}

function approxTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.ceil(trimmed.split(/\s+/).length * 1.3);
}

function countContextLines(system: string): number {
  return system.split("\n").filter((line) => line.trim().startsWith("- ")).length;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}
