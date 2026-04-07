// src/modules/proxy-client.ts
// ================================================================
// MODULE 2: IP-ROTATING PROXY CLIENT
// All outbound HTTP calls go through this.
// Rotates IPs on every request using SmartProxy or static list.
// Randomizes User-Agent, headers, timing to avoid fingerprinting.
// ================================================================

import { HttpsProxyAgent } from 'https-proxy-agent';
import { fetch as undiciFetch, Agent as UndiciAgent } from 'undici';
import { config }  from '../config.js';
import { Logger }  from './logger.js';

const log = new Logger('proxy-client');

// ── USER AGENT POOL ──────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
];

// ── ACCEPT LANGUAGE POOL ─────────────────────────────────────────
const ACCEPT_LANGUAGES = [
  'en-US,en;q=0.9',
  'en-GB,en;q=0.9,en-US;q=0.8',
  'en-US,en;q=0.9,es;q=0.8',
  'en-CA,en;q=0.9,fr-CA;q=0.8',
];

let proxyIndex = 0;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

// ── GET PROXY URL ────────────────────────────────────────────────
function getProxyUrl(): string | null {
  if (!config.proxy.enabled) return null;

  // SmartProxy rotating gateway (preferred — one endpoint, millions of IPs)
  if (config.proxy.smartproxyUser && config.proxy.smartproxyPass) {
    return `http://${config.proxy.smartproxyUser}:${config.proxy.smartproxyPass}@${config.proxy.smartproxyHost}`;
  }

  // Static proxy list — round-robin
  if (config.proxy.proxyList.length > 0) {
    const proxy = config.proxy.proxyList[proxyIndex % config.proxy.proxyList.length]!;
    proxyIndex++;
    return proxy;
  }

  return null;
}

// ── BUILD HEADERS ────────────────────────────────────────────────
function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'User-Agent':                pickRandom(USER_AGENTS),
    'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language':           pickRandom(ACCEPT_LANGUAGES),
    'Accept-Encoding':           'gzip, deflate, br',
    'DNT':                       '1',
    'Connection':                'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest':            'document',
    'Sec-Fetch-Mode':            'navigate',
    'Sec-Fetch-Site':            'none',
    'Sec-Fetch-User':            '?1',
    'Cache-Control':             'max-age=0',
    ...extra,
  };
}

// ── RANDOM JITTER DELAY ──────────────────────────────────────────
function jitter(minMs = 100, maxMs = 800): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs) + minMs);
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ── CORE FETCH WITH PROXY ────────────────────────────────────────
export interface ProxyFetchOptions {
  method?:      'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?:     Record<string, string>;
  body?:        string | URLSearchParams;
  timeout?:     number;
  useJitter?:   boolean;
  retries?:     number;
}

export async function proxyFetch(
  url:     string,
  options: ProxyFetchOptions = {},
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const {
    method    = 'GET',
    headers   = {},
    body,
    timeout   = 30_000,
    useJitter = true,
    retries   = 2,
  } = options;

  if (useJitter) await jitter();

  const proxyUrl    = getProxyUrl();
  const mergedHeaders = buildHeaders(headers);

  log.debug('HTTP_REQUEST', `${method} ${url}`, {
    proxyEnabled: !!proxyUrl,
    proxyHost:    proxyUrl ? new URL(proxyUrl).host : null,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const dispatcher = proxyUrl
        ? new HttpsProxyAgent(proxyUrl) as unknown as UndiciAgent
        : undefined;

      const controller  = new AbortController();
      const timer       = setTimeout(() => controller.abort(), timeout);

      const response = await undiciFetch(url, {
        method,
        headers: mergedHeaders,
        body:    body ?? undefined,
        signal:  controller.signal,
        ...(dispatcher ? { dispatcher } : {}),
      });

      clearTimeout(timer);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => { responseHeaders[key] = value; });

      const text = await response.text();

      log.debug('HTTP_RESPONSE', `${response.status} ${url}`, {
        status:        response.status,
        contentLength: text.length,
        attempt,
      });

      return {
        status:  response.status,
        body:    text,
        headers: responseHeaders,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        log.warn('HTTP_REQUEST', `Retry ${attempt + 1}/${retries} for ${url}`, { error: lastError.message });
        await jitter(500, 2000);
      }
    }
  }

  log.error('HTTP_REQUEST', `All retries failed for ${url}`, { error: lastError?.message });
  throw lastError ?? new Error(`Request failed: ${url}`);
}

// ── JSON HELPER ──────────────────────────────────────────────────
export async function proxyFetchJSON<T = unknown>(
  url:     string,
  options: ProxyFetchOptions & { jsonBody?: unknown } = {},
): Promise<T> {
  const { jsonBody, ...rest } = options;
  const fetchOptions: ProxyFetchOptions = {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
      ...rest.headers,
    },
  };
  if (jsonBody !== undefined) {
    fetchOptions.body   = JSON.stringify(jsonBody);
    fetchOptions.method = fetchOptions.method ?? 'POST';
  }

  const { body, status } = await proxyFetch(url, fetchOptions);

  if (status >= 400) {
    throw new Error(`HTTP ${status}: ${body.slice(0, 200)}`);
  }

  return JSON.parse(body) as T;
}
