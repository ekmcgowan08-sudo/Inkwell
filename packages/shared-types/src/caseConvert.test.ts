import { describe, expect, it } from "vitest";
import { toCamelRow, toSnakeRow } from "./caseConvert.ts";

describe("toCamelRow", () => {
  it("converts snake_case keys to camelCase", () => {
    expect(toCamelRow({ chapter_id: "c1", word_count: 42, created_at: "2026-01-01" })).toEqual({
      chapterId: "c1",
      wordCount: 42,
      createdAt: "2026-01-01",
    });
  });

  it("converts a multi-underscore key correctly", () => {
    expect(toCamelRow({ estimated_cost_usd_micros: 100 })).toEqual({ estimatedCostUsdMicros: 100 });
  });

  it("leaves an already-single-word key unchanged", () => {
    expect(toCamelRow({ id: "abc", title: "Chapter One" })).toEqual({ id: "abc", title: "Chapter One" });
  });

  it("preserves value types and null values", () => {
    expect(toCamelRow({ deleted_at: null, sort_order: 3, is_active: true })).toEqual({
      deletedAt: null,
      sortOrder: 3,
      isActive: true,
    });
  });
});

describe("toSnakeRow", () => {
  it("converts camelCase keys to snake_case", () => {
    expect(toSnakeRow({ chapterId: "c1", wordCount: 42, createdAt: "2026-01-01" })).toEqual({
      chapter_id: "c1",
      word_count: 42,
      created_at: "2026-01-01",
    });
  });

  it("converts a multi-word camelCase key correctly", () => {
    expect(toSnakeRow({ estimatedCostUsdMicros: 100 })).toEqual({ estimated_cost_usd_micros: 100 });
  });

  it("leaves an already-single-word key unchanged", () => {
    expect(toSnakeRow({ id: "abc", title: "Chapter One" })).toEqual({ id: "abc", title: "Chapter One" });
  });
});

describe("toCamelRow / toSnakeRow round-trip", () => {
  it("round-trips every real column-style key used across the schema back to its original form", () => {
    const camelKeys = [
      "chapterId",
      "wordCount",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "sortOrder",
      "projectId",
      "aiMonthlyTokenAllowance",
      "estimatedCostUsdMicros",
      "authorNote",
      "snoozedUntil",
      "isLocalOnly",
      "targetWords",
    ];
    for (const key of camelKeys) {
      const snakeRow = toSnakeRow({ [key]: 1 });
      const roundTripped = toCamelRow<Record<string, number>>(snakeRow);
      expect(roundTripped).toEqual({ [key]: 1 });
    }
  });
});
