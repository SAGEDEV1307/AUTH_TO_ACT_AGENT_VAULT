// bridge/security-bridge.ts
// Typed wrapper over lib/security.js

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const secLib = require('../lib/security.js') as {
  encrypt:          (plaintext: string) => string;
  decrypt:          (ciphertext: string) => string;
  hashSecret:       (value: string) => string;
  generateToken:    (bytes?: number) => string;
  generateApiKey:   () => string;
  timingSafeEqual:  (a: string, b: string) => boolean;
  sanitizeInput:    (str: unknown) => unknown;
};

export const encrypt         = (plaintext: string): string => secLib.encrypt(plaintext);
export const decrypt         = (ciphertext: string): string => secLib.decrypt(ciphertext);
export const hashSecret      = (value: string): string => secLib.hashSecret(value);
export const generateToken   = (bytes?: number): string => secLib.generateToken(bytes);
export const generateApiKey  = (): string => secLib.generateApiKey();
export const timingSafeEqual = (a: string, b: string): boolean => secLib.timingSafeEqual(a, b);
export const sanitizeInput   = <T>(str: T): T => secLib.sanitizeInput(str) as T;
