require('../../setup');
const { encrypt, decrypt, hashSecret, generateToken, generateApiKey, timingSafeEqual } = require('../../../lib/security');

describe('encrypt/decrypt', () => {
  it('round-trips plaintext', () => {
    expect(decrypt(encrypt('hello world'))).toBe('hello world');
  });
  it('produces unique ciphertext each call', () => {
    const a = encrypt('same'); const b = encrypt('same');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same');
    expect(decrypt(b)).toBe('same');
  });
  it('throws on tampered ciphertext', () => {
    const ct = encrypt('data');
    const buf = Buffer.from(ct, 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(() => decrypt(buf.toString('base64'))).toThrow();
  });
});

describe('hashSecret', () => {
  it('is deterministic', () => { expect(hashSecret('abc')).toBe(hashSecret('abc')); });
  it('different inputs differ', () => { expect(hashSecret('x')).not.toBe(hashSecret('y')); });
});

describe('generateApiKey', () => {
  it('starts with ata_', () => { expect(generateApiKey()).toMatch(/^ata_/); });
  it('is unique', () => { expect(generateApiKey()).not.toBe(generateApiKey()); });
});

describe('timingSafeEqual', () => {
  it('matches equal', () => { expect(timingSafeEqual('abc', 'abc')).toBe(true); });
  it('rejects different', () => { expect(timingSafeEqual('abc', 'xyz')).toBe(false); });
  it('rejects different lengths', () => { expect(timingSafeEqual('ab', 'abc')).toBe(false); });
});
