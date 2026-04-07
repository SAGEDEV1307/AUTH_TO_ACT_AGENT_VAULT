require('../../setup');
jest.mock('../../../lib/database', () => ({ query: jest.fn() }));
jest.mock('../../../lib/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
}));

const db = require('../../../lib/database');
const { getUserPermissions, hasPermission } = require('../../../lib/permissions');

beforeEach(() => jest.clearAllMocks());

it('bridge: getUserPermissions returns array', async () => {
  db.query.mockResolvedValue({ rows: [{ name: 'agent:run' }] });
  const perms = await getUserPermissions('user-123');
  expect(Array.isArray(perms)).toBe(true);
  expect(perms).toContain('agent:run');
});

it('bridge: hasPermission returns boolean', async () => {
  db.query.mockResolvedValue({ rows: [{ name: 'admin' }] });
  const result = await hasPermission('user-123', 'blockchain:send');
  expect(typeof result).toBe('boolean');
  expect(result).toBe(true);
});
