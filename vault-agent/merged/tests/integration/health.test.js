require('../setup');
const request = require('supertest');

jest.mock('../../lib/database', () => ({
  query: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue({ now: new Date() }),
  close: jest.fn(),
}));
jest.mock('../../lib/redis', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  healthCheck: jest.fn().mockResolvedValue(true),
  close: jest.fn(),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn(),
}));

const app = require('../../server');

describe('GET /health', () => {
  it('returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Unauthenticated routes return 401', () => {
  it('GET /api/auth/me', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
  it('POST /api/agent/run', async () => {
    const res = await request(app).post('/api/agent/run').send({ message: 'hi' });
    expect(res.status).toBe(401);
  });
  it('GET /api/blockchain/balance', async () => {
    const res = await request(app).get('/api/blockchain/balance');
    expect(res.status).toBe(401);
  });
  it('GET /api/keys', async () => {
    const res = await request(app).get('/api/keys');
    expect(res.status).toBe(401);
  });
  it('GET /api/admin/users', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });
});
