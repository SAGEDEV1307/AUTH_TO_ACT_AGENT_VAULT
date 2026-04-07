# Security

## No React. No Next.js.

CVE-2025-55182 (CVSS 10.0) is a remote code execution vulnerability in React Server Components.
An unauthenticated attacker can execute arbitrary code via a crafted HTTP request.
Exploited in the wild within hours of disclosure by nation-state actors.

VaultAgent uses plain HTML/CSS/JS for the frontend. Zero React. Zero Next.js.
This eliminates that entire attack surface.

## Encryption

- Secrets and private keys encrypted with AES-256-GCM
- Each ciphertext has a unique random IV — identical plaintexts produce different outputs
- Authentication tag prevents tampering — any modification is detected
- Run `npm run gen-key` to generate a proper 32-byte encryption key

## Crypto wallet key management

- Private keys encrypted with scrypt-derived key (salt + passphrase)
- Never stored in plaintext — decrypted in memory only when needed
- Separate from the main ENCRYPTION_KEY

## API keys

- Raw key shown only once at creation
- Only SHA-256 hash stored in database
- Comparison via `crypto.timingSafeEqual` — prevents timing attacks

## HITL (Human in the Loop)

- ALL financial actions above threshold require human approval
- Default: $10 USD / 0.001 ETH triggers HITL
- Timeout defaults to DENY — if no response in 5 min, action is blocked
- Approval via Telegram inline buttons, HTTPS endpoint, or SMS

## Rate limiting

- Redis-backed sliding window
- Separate limits: API (100/15min), agent runs (20/hr), auth (10/15min)
- Brute force protection on HTTPS auth: 5 failures = 15-minute IP block

## Audit logs

- Every action logged with tamper-evident SHA-256 chain
- Each log entry hashes the previous entry — any tampering is detectable
- Financial actions logged at WARN level — they stand out
