require('../setup');
const request = require('supertest');

jest.mock('../../lib/database', () => ({
  query: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue({}),
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

describe('GET /api/blockchain/balance', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/blockchain/balance');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/blockchain/send', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/blockchain/send').send({ to: '0x123', value: '0.1' });
    expect(res.status).toBe(401);
  });
});
