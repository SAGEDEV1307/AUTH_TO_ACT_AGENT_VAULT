require('../../setup');

// Bridge re-exports lib/security — verify types pass through correctly
const { encrypt, decrypt, hashSecret, generateApiKey, timingSafeEqual } = require('../../../lib/security');

describe('security bridge passthrough', () => {
  it('encrypt/decrypt round-trips', () => {
    const ct = encrypt('bridge-test');
    expect(decrypt(ct)).toBe('bridge-test');
  });
  it('hashSecret consistent', () => {
    expect(hashSecret('test')).toBe(hashSecret('test'));
  });
  it('generateApiKey has prefix', () => {
    expect(generateApiKey()).toMatch(/^ata_/);
  });
  it('timingSafeEqual works', () => {
    expect(timingSafeEqual('same', 'same')).toBe(true);
    expect(timingSafeEqual('a', 'b')).toBe(false);
  });
});
