// src/module-system.ts
// BotModule interface + ModuleLoader + TriggerEngine from modular-bot,
// wired into VaultAgent's brain and task system.

import { readdirSync, realpathSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { logger, logSecurityEvent } from './logger.js';

// ── TYPES ────────────────────────────────────────────────────────

export type ModelName = 'claude' | 'deepseek' | 'deepseek-reasoner' | 'gemini' | 'ollama';

export interface BotModule {
  name:         string;
  triggers:     string[];
  model:        ModelName;
  systemPrompt?: string;
  execute:      (input: string, ai: ModuleAI) => Promise<string>;
}

// Minimal AI interface exposed to modules — prevents modules from
// accessing the full brain/router internals
export interface ModuleAI {
  call: (model: ModelName, prompt: string, systemPrompt?: string) => Promise<string>;
}

// ── VALIDATION CONSTANTS ─────────────────────────────────────────
const ALLOWED_EXTENSIONS  = new Set(['.ts', '.js']);
const ALLOWED_MODELS      = new Set<ModelName>(['claude', 'deepseek', 'deepseek-reasoner', 'gemini', 'ollama']);
const MAX_TRIGGERS        = 50;
const MAX_TRIGGER_LENGTH  = 100;
const MAX_MODULE_NAME_LENGTH = 64;

// ── MODULE LOADER ────────────────────────────────────────────────
// Dynamically loads BotModule files from a directory.
// OWASP A01: Path traversal protection.
// OWASP A08: Full contract validation before accepting any module.
// OWASP A10: One bad module never blocks others.

export class ModuleLoader {
  private readonly resolvedDir: string;

  constructor(modulesDir: string) {
    this.resolvedDir = resolve(modulesDir);
  }

  async loadAll(): Promise<BotModule[]> {
    const loaded: BotModule[] = [];
    let files: string[];
    try {
      files = readdirSync(this.resolvedDir);
    } catch {
      logger.warn(`Cannot read modules directory: ${this.resolvedDir}`);
      return [];
    }

    for (const file of files) {
      const ext = file.slice(file.lastIndexOf('.'));
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;

      const fullPath = join(this.resolvedDir, file);
      let realPath: string;
      try {
        realPath = realpathSync(fullPath);
      } catch {
        logSecurityEvent('MODULE_PATH_RESOLUTION_FAILED', { file });
        continue;
      }

      if (!realPath.startsWith(this.resolvedDir)) {
        logSecurityEvent('MODULE_PATH_TRAVERSAL_ATTEMPT', { file, resolvedPath: realPath });
        logger.error(`Path traversal blocked for module: ${file}`);
        continue;
      }

      try {
        if (statSync(realPath).isDirectory()) continue;
      } catch { continue; }

      try {
        const mod = await import(pathToFileURL(realPath).href);
        const botModule: BotModule = mod.default;
        const err = validateModule(botModule);
        if (err) { logger.warn(`Skipping ${file}: ${err}`); continue; }
        loaded.push(botModule);
        logger.info(`Loaded module: [${botModule.model.toUpperCase()}] ${botModule.name}`);
      } catch (err) {
        logger.error(`Failed to load module ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    logger.info(`ModuleLoader: loaded ${loaded.length} module(s)`);
    return loaded;
  }
}

function validateModule(mod: unknown): string | null {
  if (!mod || typeof mod !== 'object') return 'default export is not an object';
  const m = mod as Record<string, unknown>;
  if (typeof m['name'] !== 'string' || (m['name'] as string).trim().length === 0) return 'name must be non-empty string';
  if ((m['name'] as string).length > MAX_MODULE_NAME_LENGTH) return 'name too long';
  if (!Array.isArray(m['triggers']) || (m['triggers'] as unknown[]).length === 0) return 'triggers must be non-empty array';
  if ((m['triggers'] as unknown[]).length > MAX_TRIGGERS) return 'too many triggers';
  for (const t of m['triggers'] as unknown[]) {
    if (typeof t !== 'string' || (t as string).trim().length === 0) return 'all triggers must be non-empty strings';
    if ((t as string).length > MAX_TRIGGER_LENGTH) return 'trigger too long';
  }
  if (!ALLOWED_MODELS.has(m['model'] as ModelName)) return `model "${m['model']}" not in allowed list`;
  if (typeof m['execute'] !== 'function') return 'execute must be a function';
  return null;
}

// ── TRIGGER ENGINE ────────────────────────────────────────────────
// Matches input against module triggers, enforces rate limits,
// dispatches to matching modules in isolation.

interface RateLimitEntry { count: number; resetAt: number; }

export class TriggerEngine {
  private modules: BotModule[] = [];
  private moduleLimits = new Map<string, RateLimitEntry>();
  private globalLimit: RateLimitEntry = { count: 0, resetAt: Date.now() + 60_000 };

  private readonly RATE_LIMIT  = parseInt(process.env['RATE_LIMIT_PER_MINUTE'] ?? '20', 10);
  private readonly GLOBAL_LIMIT = this.RATE_LIMIT * 3;
  private readonly WINDOW_MS    = 60_000;
  private readonly MAX_INPUT    = parseInt(process.env['MAX_INPUT_LENGTH'] ?? '4000', 10);

  // Injection patterns — from modular-bot AIRouter
  private static readonly INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
    /you\s+are\s+now\s+(a\s+)?different/i,
    /system\s*:\s*you/i,
    /\[system\]/i,
    /<\s*system\s*>/i,
    /jailbreak/i,
    /disregard\s+(your\s+)?instructions/i,
  ];

  constructor(private ai: ModuleAI) {}

  register(mod: BotModule): void {
    if (!mod.name || !mod.triggers?.length || typeof mod.execute !== 'function') {
      logger.error(`Refusing malformed module: ${mod.name ?? 'unnamed'}`);
      return;
    }
    this.modules.push(mod);
    logger.info(`TriggerEngine: registered ${mod.name}`);
  }

  getModules(): BotModule[] { return [...this.modules]; }

  async dispatch(rawInput: string): Promise<string[]> {
    if (!rawInput?.trim()) return [];

    // Sanitize
    const sanitized = rawInput
      .replace(/\0/g, '')
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim()
      .slice(0, this.MAX_INPUT);

    if (sanitized.length < rawInput.trim().length) {
      logSecurityEvent('INPUT_SANITIZED', { originalLength: rawInput.length, sanitizedLength: sanitized.length });
    }

    // Injection detection
    if (TriggerEngine.INJECTION_PATTERNS.some(p => p.test(sanitized))) {
      logSecurityEvent('PROMPT_INJECTION_BLOCKED', { inputLength: sanitized.length });
      return ['Input blocked — potential prompt injection detected'];
    }

    if (!this.checkGlobalRateLimit()) {
      logSecurityEvent('GLOBAL_RATE_LIMIT_HIT', {});
      return ['Global rate limit reached — slow down'];
    }

    const lower   = sanitized.toLowerCase();
    const matched = this.modules.filter(m => m.triggers.some(t => lower.includes(t.toLowerCase())));
    if (matched.length === 0) return [];

    const results: string[] = [];
    for (const mod of matched) {
      if (!this.checkModuleRateLimit(mod.name)) {
        logSecurityEvent('MODULE_RATE_LIMIT_HIT', { module: mod.name });
        results.push(`Rate limit reached for ${mod.name}`);
        continue;
      }
      try {
        const result = await mod.execute(sanitized, this.ai);
        if (typeof result !== 'string' || result.trim().length === 0) {
          throw new Error('Module returned empty or non-string result');
        }
        logger.info(`Module ${mod.name} responded`);
        results.push(result);
      } catch (err) {
        logger.error(`Module ${mod.name} failed: ${err instanceof Error ? err.message : String(err)}`);
        results.push(`${mod.name} encountered an error`);
      }
    }
    return results;
  }

  private checkModuleRateLimit(name: string): boolean {
    const now   = Date.now();
    const entry = this.moduleLimits.get(name);
    if (!entry || now > entry.resetAt) {
      this.moduleLimits.set(name, { count: 1, resetAt: now + this.WINDOW_MS });
      return true;
    }
    if (entry.count >= this.RATE_LIMIT) return false;
    entry.count++;
    return true;
  }

  private checkGlobalRateLimit(): boolean {
    const now = Date.now();
    if (now > this.globalLimit.resetAt) {
      this.globalLimit = { count: 1, resetAt: now + this.WINDOW_MS };
      return true;
    }
    if (this.globalLimit.count >= this.GLOBAL_LIMIT) return false;
    this.globalLimit.count++;
    return true;
  }
}
