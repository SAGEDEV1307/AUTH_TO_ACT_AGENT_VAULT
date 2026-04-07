require('../setup');
const request = require('supertest');
const app = require('../../server');

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

const db = require('../../lib/database');

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/permissions', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/auth/permissions');
    expect(res.status).toBe(401);
  });
});
