import { describe, expect, it } from "vitest";
import { extractFindings, FINDINGS_BLOCK_END, FINDINGS_BLOCK_START } from "./findingsExtraction.ts";

describe("extractFindings", () => {
  it("returns the response unchanged when no findings block is present", () => {
    const result = extractFindings("Just a plain conversational answer.");
    expect(result.text).toBe("Just a plain conversational answer.");
    expect(result.findings).toEqual([]);
  });

  it("strips the findings block from the visible text and parses valid findings", () => {
    const response = [
      "Here is my analysis of the manuscript.",
      "",
      FINDINGS_BLOCK_START,
      JSON.stringify([
        {
          findingType: "contradiction",
          severity: "medium",
          confidence: 0.8,
          title: "Eye color contradiction",
          explanation: "Chapter 2 says brown eyes; chapter 5 says blue. [scene:abc-123]",
        },
      ]),
      FINDINGS_BLOCK_END,
    ].join("\n");

    const result = extractFindings(response);

    expect(result.text).toBe("Here is my analysis of the manuscript.");
    expect(result.text).not.toContain(FINDINGS_BLOCK_START);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ findingType: "contradiction", title: "Eye color contradiction" });
  });

  it("treats an empty findings array as zero findings, not an error", () => {
    const response = `Nothing to report.\n\n${FINDINGS_BLOCK_START}[]${FINDINGS_BLOCK_END}`;
    const result = extractFindings(response);
    expect(result.text).toBe("Nothing to report.");
    expect(result.findings).toEqual([]);
  });

  it("strips the block but yields zero findings when the JSON is malformed, without throwing", () => {
    const response = `My answer.\n\n${FINDINGS_BLOCK_START}not valid json${FINDINGS_BLOCK_END}`;
    const result = extractFindings(response);
    expect(result.text).toBe("My answer.");
    expect(result.findings).toEqual([]);
  });

  it("drops a finding that fails schema validation (e.g. an unknown findingType) rather than throwing", () => {
    const response = `Answer.\n\n${FINDINGS_BLOCK_START}${JSON.stringify([
      { findingType: "not_a_real_type", severity: "medium", confidence: 0.5, title: "x", explanation: "y" },
    ])}${FINDINGS_BLOCK_END}`;
    const result = extractFindings(response);
    expect(result.findings).toEqual([]);
  });
});
