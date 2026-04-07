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

describe('POST /api/agent/run', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/agent/run').send({ message: 'hello' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid api key', async () => {
    const db = require('../../lib/database');
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/agent/run')
      .set('x-api-key', 'ata_badkey')
      .send({ message: 'hello' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/agent/history', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/agent/history');
    expect(res.status).toBe(401);
  });
});
