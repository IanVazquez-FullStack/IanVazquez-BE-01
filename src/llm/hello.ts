import "dotenv/config";
import OpenAI from "openai";

async function main(): Promise<void> {
  if (process.env.LLM_STUB === "1") {
    console.log(
      "[hello] LLM_STUB=1 is set — skipping the model call. " +
        "Set a real LLM_API_KEY and unset LLM_STUB to confirm the real connection."
    );
    return;
  }

  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseURL || !apiKey) {
    console.error("[hello] Missing LLM_BASE_URL or LLM_API_KEY in .env");
    process.exit(1);
  }

  const client = new OpenAI({ baseURL, apiKey });
  const model = process.env.LLM_MODEL || "openrouter/free";

  const reply = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "Reply with exactly the single word: CONNECTED" },
      { role: "user", content: "ping" },
    ],
    temperature: 0,
  });

  console.log(`[hello] model=${model}`);
  console.log(`[hello] reply=${reply.choices[0]?.message?.content ?? "<empty>"}`);
}

main().catch((err) => {
  console.error("[hello] failed:", err);
  process.exit(1);
});
