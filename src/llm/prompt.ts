import fs from "fs";
import path from "path";

export const PROMPT_VERSION = "classify-task-v1";

export function loadPrompt(version: string = PROMPT_VERSION): string {
  const file = path.join(__dirname, "..", "..", "prompts", `${version}.md`);
  return fs.readFileSync(file, "utf8");
}
