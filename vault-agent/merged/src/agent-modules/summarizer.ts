/**
 * summarizer.ts — OWASP 2025 compliant module
 *
 * A05 Injection           — input received pre-sanitized from TriggerEngine, no re-interpolation
 * A08 Data Integrity      — response validated by AIRouter before returning
 * A09 Security Logging    — errors logged internally with context
 * A10 Exceptional Cond.   — execute never throws, returns safe error string on failure
 */

import type { BotModule } from "../module-system.js";
import type { AIRouter } from "../module-system.js";
import { logger } from "../logger.js";

const summarizer: BotModule = {
  name: "Summarizer",
  triggers: ["summarize", "tldr", "sum up", "brief me", "overview of", "short version"],
  model: "deepseek",
  systemPrompt:
    "You are a precise summarizer. Return a concise summary with bullet points for key facts. " +
    "Be factual, be brief, no filler content.",

  async execute(input: string, ai: AIRouter): Promise<string> {
    try {
      return await ai.call(
        "deepseek",
        `Summarize the following clearly and concisely:\n\n${input}`,
        this.systemPrompt
      );
    } catch (err) {
      // A09: Log the real error internally
      logger.error(`Summarizer failed: ${err instanceof Error ? err.message : String(err)}`);
      // A10: Return safe generic message — never throw out of execute
      return "Summarizer encountered an error. Please try again.";
    }
  },
};

export default summarizer;
