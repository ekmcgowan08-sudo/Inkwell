import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnthropicProvider, DEFAULT_ANTHROPIC_MODEL, ANTHROPIC_API_VERSION } from "./anthropicProvider.ts";

function mockFetchOnce(response: { ok: boolean; status?: number; json?: unknown; text?: string }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: async () => response.json,
    text: async () => response.text ?? "",
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createAnthropicProvider", () => {
  it("sends the system/user messages, model, and required Anthropic headers", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      json: { content: [{ type: "text", text: "Hello." }], usage: { input_tokens: 10, output_tokens: 5 } },
    });
    const provider = createAnthropicProvider({ apiKey: "sk-test-key" });

    await provider.complete({ system: "You are a helpful assistant.", user: "What happens next?", maxTokens: 500 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({ "x-api-key": "sk-test-key", "anthropic-version": ANTHROPIC_API_VERSION });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 500,
      system: "You are a helpful assistant.",
      messages: [{ role: "user", content: "What happens next?" }],
    });
  });

  it("uses the configured model, falling back to the default when blank/whitespace", async () => {
    mockFetchOnce({ ok: true, json: { content: [], usage: {} } });
    await createAnthropicProvider({ apiKey: "k", model: "  " }).complete({ system: "s", user: "u" });
    const configured = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(configured.body as string).model).toBe(DEFAULT_ANTHROPIC_MODEL);

    mockFetchOnce({ ok: true, json: { content: [], usage: {} } });
    await createAnthropicProvider({ apiKey: "k", model: "claude-opus-5" }).complete({ system: "s", user: "u" });
    const custom = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(custom.body as string).model).toBe("claude-opus-5");
  });

  it("joins multiple text content blocks and ignores non-text blocks", async () => {
    mockFetchOnce({
      ok: true,
      json: { content: [{ type: "text", text: "First." }, { type: "tool_use" }, { type: "text", text: "Second." }], usage: {} },
    });
    const result = await createAnthropicProvider({ apiKey: "k" }).complete({ system: "s", user: "u" });
    expect(result.text).toBe("First.\nSecond.");
  });

  it("returns a placeholder when the response has no text content", async () => {
    mockFetchOnce({ ok: true, json: { content: [], usage: {} } });
    const result = await createAnthropicProvider({ apiKey: "k" }).complete({ system: "s", user: "u" });
    expect(result.text).toBe("No response.");
  });

  it("defaults usage token counts to 0 when the response omits them", async () => {
    mockFetchOnce({ ok: true, json: { content: [{ type: "text", text: "x" }] } });
    const result = await createAnthropicProvider({ apiKey: "k" }).complete({ system: "s", user: "u" });
    expect(result.usage).toEqual({ tokensInput: 0, tokensOutput: 0 });
  });

  it("reports real usage token counts when present", async () => {
    mockFetchOnce({ ok: true, json: { content: [{ type: "text", text: "x" }], usage: { input_tokens: 42, output_tokens: 7 } } });
    const result = await createAnthropicProvider({ apiKey: "k" }).complete({ system: "s", user: "u" });
    expect(result.usage).toEqual({ tokensInput: 42, tokensOutput: 7 });
  });

  it("throws a descriptive error, including the status and truncated body, on a non-ok response", async () => {
    mockFetchOnce({ ok: false, status: 401, text: "invalid x-api-key" });
    await expect(createAnthropicProvider({ apiKey: "bad-key" }).complete({ system: "s", user: "u" })).rejects.toThrow(
      /Anthropic API error 401.*invalid x-api-key/,
    );
  });
});
