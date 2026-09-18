import { z } from "zod";
import { findingTypeSchema } from "@inkwell/shared-types";

export const FINDINGS_BLOCK_START = "===FINDINGS_JSON===";
export const FINDINGS_BLOCK_END = "===END_FINDINGS_JSON===";

const extractedFindingSchema = z.object({
  findingType: findingTypeSchema,
  severity: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  title: z.string().min(1).max(200),
  explanation: z.string().min(1),
});
export type ExtractedFinding = z.infer<typeof extractedFindingSchema>;

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const FINDINGS_BLOCK_PATTERN = new RegExp(`${escapeRegExp(FINDINGS_BLOCK_START)}([\\s\\S]*?)${escapeRegExp(FINDINGS_BLOCK_END)}`);

/**
 * Strips the model's optional trailing findings block (see `promptBuilder.ts` —
 * `FINDINGS_ELIGIBLE_MODES` appends the instruction to ask for one, only for the
 * consistency-check-family modes) out of the visible response text, and parses it into
 * structured findings the caller can persist as `ai_findings` rows.
 *
 * Malformed or missing JSON is treated as "no findings" — a parsing failure never blocks or
 * alters the conversational answer; only the block itself (if present) is stripped either way,
 * so raw JSON never leaks into what the author sees in the chat transcript.
 */
export function extractFindings(responseText: string): { text: string; findings: ExtractedFinding[] } {
  const match = responseText.match(FINDINGS_BLOCK_PATTERN);
  if (!match || match.index === undefined) return { text: responseText, findings: [] };

  const strippedText = (responseText.slice(0, match.index) + responseText.slice(match.index + match[0].length)).trim();

  let findings: ExtractedFinding[] = [];
  try {
    const parsed: unknown = JSON.parse(match[1]!.trim());
    const result = z.array(extractedFindingSchema).safeParse(parsed);
    if (result.success) findings = result.data;
  } catch {
    // Malformed JSON from the model — silently treated as no findings, not surfaced as an error.
  }

  return { text: strippedText, findings };
}
