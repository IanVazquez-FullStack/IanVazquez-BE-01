import OpenAI from "openai";
import { UpstreamUnavailableError } from "../services/errors";

export function getClient(): OpenAI {
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseURL || !apiKey) {
    throw new UpstreamUnavailableError(
      "LLM not configured: set LLM_BASE_URL and LLM_API_KEY (or LLM_STUB=1 to bypass the model)"
    );
  }
  return new OpenAI({ baseURL, apiKey });
}
