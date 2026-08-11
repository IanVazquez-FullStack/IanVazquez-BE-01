import OpenAI from "openai";
import { APIConnectionError, APIConnectionTimeoutError } from "openai/error";
import { LLMTimeoutError, UpstreamUnavailableError } from "../services/errors";

export const REQUEST_TIMEOUT_MS = 25_000;
export const MAX_RETRIES = 3;
export const BACKOFF_MS = [1000, 2000, 4000];
export const JITTER_MS = 400;

export interface ChatRequest {
  model: string;
  system: string;
  user: string;
  temperature: number;
}

export interface LlmCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  retries: number;
}

export type ChatCompletionsApi = Pick<OpenAI, "chat">;

export function getClient(): ChatCompletionsApi {
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseURL || !apiKey) {
    throw new UpstreamUnavailableError(
      "LLM not configured: set LLM_BASE_URL and LLM_API_KEY (or LLM_STUB=1 to bypass the model)"
    );
  }
  return new OpenAI({
    baseURL,
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0, // SDK auto-retries disabled on purpose: the retry policy below owns
    // all retry behavior (what is retryable, backoff, Retry-After). Relying on the
    // SDK default (2 retries) would double up with our own policy.
  });
}

export async function callLlm(request: ChatRequest, client: ChatCompletionsApi): Promise<LlmCallResult> {
  let attempts = 0;
  for (;;) {
    try {
      const response = await client.chat.completions.create({
        model: request.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        temperature: request.temperature,
      });
      return {
        text: response.choices[0]?.message?.content ?? "",
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        retries: attempts,
      };
    } catch (err) {
      if (!isRetryable(err)) throw mapUpstreamError(err);
      if (attempts >= MAX_RETRIES) {
        if (err instanceof APIConnectionTimeoutError) {
          throw new LLMTimeoutError(
            `LLM request timed out after ${MAX_RETRIES} retries (${REQUEST_TIMEOUT_MS}ms per attempt)`
          );
        }
        throw mapUpstreamError(err);
      }
      const delay = retryDelayMs(err, attempts);
      attempts += 1;
      await sleep(delay);
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof APIConnectionError) return true;
  const status = (err as { status?: unknown })?.status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500 && status < 600) return true;
  return false;
}

function retryDelayMs(err: unknown, attemptsMade: number): number {
  const retryAfter = parseRetryAfter((err as { headers?: unknown })?.headers);
  if (retryAfter !== null) return retryAfter;
  const base = BACKOFF_MS[Math.min(attemptsMade, BACKOFF_MS.length - 1)];
  return base + Math.floor(Math.random() * (JITTER_MS + 1));
}

function parseRetryAfter(headers: unknown): number | null {
  if (!headers) return null;
  const read = (key: string): string | undefined => {
    const h = headers as { get?: (k: string) => string | null };
    if (typeof h.get === "function") {
      const value = h.get(key);
      return value ?? undefined;
    }
    const record = headers as Record<string, string>;
    const value = record[key] ?? record[key.toLowerCase()] ?? record[key.charAt(0).toUpperCase() + key.slice(1)];
    return typeof value === "string" ? value : undefined;
  };
  const raw = read("retry-after");
  if (raw === undefined) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function mapUpstreamError(err: unknown): UpstreamUnavailableError {
  const status = (err as { status?: unknown })?.status;
  if (status === 401 || status === 403) {
    return new UpstreamUnavailableError(
      `LLM provider rejected the request (HTTP ${status}) — check LLM_API_KEY and provider permissions`
    );
  }
  if (typeof status === "number") {
    return new UpstreamUnavailableError(`LLM provider request failed (HTTP ${status})`);
  }
  return new UpstreamUnavailableError(`LLM provider request failed: ${err instanceof Error ? err.message : String(err)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
