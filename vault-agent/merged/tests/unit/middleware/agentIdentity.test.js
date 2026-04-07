require('../../setup');

jest.mock('../../../lib/database', () => ({ query: jest.fn() }));
jest.mock('../../../lib/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
}));

const db = require('../../../lib/database');
const { agentIdentityAuth } = require('../../../middleware/agentIdentity');
const { hashSecret } = require('../../../lib/security');

function mockReq(headers = {}) { return { headers, ip: '127.0.0.1' }; }
function mockRes() { const r = {}; r.status = jest.fn().mockReturnValue(r); r.json = jest.fn(); return r; }

describe('agentIdentityAuth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('skips when no headers present', async () => {
    const next = jest.fn();
    await agentIdentityAuth(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects unknown agent ID', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const next = jest.fn();
    await agentIdentityAuth(mockReq({ 'x-agent-id': 'bad-id', 'x-agent-token': 'token' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
  });

  it('rejects wrong token', async () => {
    const correctHash = hashSecret('correct-token');
    db.query.mockResolvedValue({ rows: [{ id: 'a1', user_id: 'u1', name: 'bot', token_hash: correctHash, permissions: [], revoked_at: null, is_active: true }] });
    const next = jest.fn();
    await agentIdentityAuth(mockReq({ 'x-agent-id': 'a1', 'x-agent-token': 'wrong-token' }), mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
  });

  it('attaches agent to req on valid credentials', async () => {
    const token = 'valid-agent-token';
    const hash = hashSecret(token);
    db.query.mockResolvedValue({ rows: [{ id: 'a1', user_id: 'u1', name: 'bot', token_hash: hash, permissions: ['agent:run'], revoked_at: null, is_active: true }] });
    const req = mockReq({ 'x-agent-id': 'a1', 'x-agent-token': token });
    const next = jest.fn();
    await agentIdentityAuth(req, mockRes(), next);
    expect(req.agent).toBeDefined();
    expect(req.agent.name).toBe('bot');
    expect(next).toHaveBeenCalledWith();
  });
});
