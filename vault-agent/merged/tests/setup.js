process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vault_agent_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.API_MASTER_KEY = 'test-master-key';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.AUTH0_DOMAIN = 'test.auth0.com';
process.env.AUTH0_CLIENT_ID = 'test-client';
process.env.AUTH0_AUDIENCE = 'https://test.local';
process.env.SQLITE_PATH = './data/test-agent.db';

jest.setTimeout(15000);
