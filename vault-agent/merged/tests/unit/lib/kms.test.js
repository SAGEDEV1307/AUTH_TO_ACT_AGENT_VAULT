require('../../setup');
jest.mock('../../../lib/database', () => ({ query: jest.fn() }));

const db = require('../../../lib/database');
const { storeSecret, retrieveSecret, deleteSecret } = require('../../../lib/kms');

beforeEach(() => jest.clearAllMocks());

it('storeSecret encrypts value before saving', async () => {
  db.query.mockResolvedValue({ rows: [{ id: '1', name: 'k', created_at: new Date() }] });
  await storeSecret('u1', 'k', 'raw-secret');
  const saved = db.query.mock.calls[0][1][2];
  expect(saved).not.toBe('raw-secret');
});

it('retrieveSecret decrypts from DB', async () => {
  const { encrypt } = require('../../../lib/security');
  db.query.mockResolvedValue({ rows: [{ id: '1', name: 'k', encrypted_value: encrypt('the-value'), metadata: {} }] });
  const result = await retrieveSecret('u1', 'k');
  expect(result.value).toBe('the-value');
});

it('retrieveSecret returns null when not found', async () => {
  db.query.mockResolvedValue({ rows: [] });
  expect(await retrieveSecret('u1', 'missing')).toBeNull();
});

it('deleteSecret returns true when deleted', async () => {
  db.query.mockResolvedValue({ rowCount: 1 });
  expect(await deleteSecret('u1', 'k')).toBe(true);
});
