/**
 * reasoner.ts — OWASP 2025 compliant module
 *
 * A05 Injection           — input received pre-sanitized
 * A08 Data Integrity      — response validated by AIRouter
 * A09 Security Logging    — errors logged with context
 * A10 Exceptional Cond.   — execute never throws
 */

import type { BotModule } from "../module-system.js";
import type { AIRouter } from "../module-system.js";
import { logger } from "../logger.js";

const reasoner: BotModule = {
  name: "Reasoner",
  triggers: [
    "reason through", "think step by step", "analyze", "pros and cons",
    "should i", "decision", "evaluate", "weigh up", "compare"
  ],
  model: "deepseek-reasoner",
  systemPrompt:
    "You are a deep analytical thinker using chain-of-thought reasoning. " +
    "Break down problems step by step. Show your reasoning. " +
    "Weigh trade-offs clearly and give a concrete recommendation at the end.",

  async execute(input: string, ai: AIRouter): Promise<string> {
    try {
      return await ai.call("deepseek-reasoner", input, this.systemPrompt);
    } catch (err) {
      logger.error(`Reasoner failed: ${err instanceof Error ? err.message : String(err)}`);
      return "Reasoner encountered an error. Please try again.";
    }
  },
};

export default reasoner;
