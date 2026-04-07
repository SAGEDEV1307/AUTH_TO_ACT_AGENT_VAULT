require('../../setup');
const { PERMISSIONS } = require('../../../lib/constants');

jest.mock('../../../lib/database', () => ({ query: jest.fn() }));
jest.mock('../../../lib/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
}));

const db = require('../../../lib/database');
const { getUserPermissions, hasPermission, requirePermission } = require('../../../lib/permissions');

beforeEach(() => jest.clearAllMocks());

describe('getUserPermissions', () => {
  it('returns names from DB', async () => {
    db.query.mockResolvedValue({ rows: [{ name: 'agent:run' }, { name: 'blockchain:read' }] });
    const perms = await getUserPermissions('uid-1');
    expect(perms).toContain('agent:run');
    expect(perms).toContain('blockchain:read');
  });
});

describe('hasPermission', () => {
  it('true when present', async () => {
    db.query.mockResolvedValue({ rows: [{ name: PERMISSIONS.AGENT_RUN }] });
    expect(await hasPermission('uid-1', PERMISSIONS.AGENT_RUN)).toBe(true);
  });
  it('true when admin', async () => {
    db.query.mockResolvedValue({ rows: [{ name: PERMISSIONS.ADMIN }] });
    expect(await hasPermission('uid-1', PERMISSIONS.BLOCKCHAIN_SEND)).toBe(true);
  });
  it('false when absent', async () => {
    db.query.mockResolvedValue({ rows: [{ name: PERMISSIONS.AGENT_RUN }] });
    expect(await hasPermission('uid-1', PERMISSIONS.BLOCKCHAIN_SEND)).toBe(false);
  });
});
