/**
 * codeHelper.ts — OWASP 2025 compliant module
 *
 * A05 Injection           — input received pre-sanitized, never eval'd or executed
 * A08 Data Integrity      — response validated by AIRouter
 * A09 Security Logging    — errors logged with context
 * A10 Exceptional Cond.   — execute never throws
 */

import type { BotModule } from "../module-system.js";
import type { AIRouter } from "../module-system.js";
import { logger } from "../logger.js";

const codeHelper: BotModule = {
  name: "CodeHelper",
  triggers: [
    "code", "write a function", "debug", "fix this", "typescript",
    "javascript", "refactor", "explain this code", "how do i", "implement"
  ],
  model: "claude",
  systemPrompt:
    "You are a senior TypeScript/JavaScript engineer. Write clean, strongly-typed, " +
    "production-ready code. Always explain what the code does. Flag security concerns. " +
    "Never suggest eval(), never suggest disabling TypeScript strict mode.",

  async execute(input: string, ai: AIRouter): Promise<string> {
    try {
      return await ai.call("claude", input, this.systemPrompt);
    } catch (err) {
      logger.error(`CodeHelper failed: ${err instanceof Error ? err.message : String(err)}`);
      return "CodeHelper encountered an error. Please try again.";
    }
  },
};

export default codeHelper;
