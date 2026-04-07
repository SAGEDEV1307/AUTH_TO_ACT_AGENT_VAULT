require('../../setup');

jest.mock('../../../lib/database', () => ({ query: jest.fn() }));
jest.mock('../../../lib/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
}));

const db = require('../../../lib/database');
const redis = require('../../../lib/redis');
const { apiKeyAuth } = require('../../../middleware/apiKey');
const { hashSecret } = require('../../../lib/security');

function mockReq(headers = {}) {
  return { headers };
}
function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

describe('apiKeyAuth middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next() with no x-api-key header', async () => {
    const next = jest.fn();
    await apiKeyAuth(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(error) for unknown key', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const next = jest.fn();
    await apiKeyAuth(mockReq({ 'x-api-key': 'ata_bogus' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
  });

  it('calls next(error) for revoked key', async () => {
    db.query.mockResolvedValue({ rows: [{ id: '1', user_id: 'u1', name: 'test', permissions: [], revoked_at: new Date(), auth0_id: 'auth0|x', email: 'x@x.com', user_name: 'X', is_active: true }] });
    const next = jest.fn();
    await apiKeyAuth(mockReq({ 'x-api-key': 'ata_somekey' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
  });

  it('attaches user to req for valid key', async () => {
    db.query.mockResolvedValue({ rows: [{ id: '1', user_id: 'u1', name: 'test', permissions: [], revoked_at: null, auth0_id: 'auth0|u1', email: 'u@u.com', user_name: 'User', is_active: true }] });
    const req = mockReq({ 'x-api-key': 'ata_validkey' });
    const next = jest.fn();
    await apiKeyAuth(req, mockRes(), next);
    expect(req.user).toBeDefined();
    expect(req.user.email).toBe('u@u.com');
    expect(next).toHaveBeenCalledWith();
  });
});
