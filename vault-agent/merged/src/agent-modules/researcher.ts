/**
 * researcher.ts — OWASP 2025 compliant module
 *
 * A05 Injection           — input received pre-sanitized
 * A08 Data Integrity      — response validated by AIRouter
 * A09 Security Logging    — errors logged with context
 * A10 Exceptional Cond.   — execute never throws
 */

import type { BotModule } from "../module-system.js";
import type { AIRouter } from "../module-system.js";
import { logger } from "../logger.js";

const researcher: BotModule = {
  name: "Researcher",
  triggers: [
    "research", "find info", "what is", "who is", "explain",
    "how does", "tell me about", "what are", "why does", "when did"
  ],
  model: "gemini",
  systemPrompt:
    "You are a knowledgeable research assistant. Provide accurate, well-structured answers. " +
    "Use headings and bullet points where helpful. State clearly if something is uncertain.",

  async execute(input: string, ai: AIRouter): Promise<string> {
    try {
      return await ai.call("gemini", input, this.systemPrompt);
    } catch (err) {
      logger.error(`Researcher failed: ${err instanceof Error ? err.message : String(err)}`);
      return "Researcher encountered an error. Please try again.";
    }
  },
};

export default researcher;
