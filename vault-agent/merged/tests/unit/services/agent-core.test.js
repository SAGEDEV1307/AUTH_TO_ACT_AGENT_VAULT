require('../../setup');

jest.mock('../../../services/ai/anthropic', () => ({
  runAgentLoop: jest.fn(),
}));
jest.mock('../../../services/ai/openai', () => ({
  runAgentLoop: jest.fn(),
}));
jest.mock('../../../services/agent/history', () => ({
  createRun: jest.fn().mockResolvedValue({ id: 'run-1', created_at: new Date() }),
  updateRun: jest.fn().mockResolvedValue(),
  getRun: jest.fn(),
}));
jest.mock('../../../services/agent/permission-check', () => ({
  filterAllowedTools: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../lib/database', () => ({ query: jest.fn() }));
jest.mock('../../../lib/redis', () => ({ get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() }));

const anthropic = require('../../../services/ai/anthropic');
const history = require('../../../services/agent/history');
const { runAgent } = require('../../../services/agent/core');

describe('runAgent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('runs with anthropic provider and returns completed status', async () => {
    anthropic.runAgentLoop.mockResolvedValue({
      finalResponse: 'Here is your answer.',
      iterations: [{ index: 0, response: { stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 20 } } }],
      messages: [],
    });

    const result = await runAgent({ userId: 'u1', userMessage: 'Hello', provider: 'anthropic' });
    expect(result.status).toBe('completed');
    expect(result.finalResponse).toBe('Here is your answer.');
    expect(history.updateRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'completed' }));
  });

  it('marks run as failed when agent throws', async () => {
    anthropic.runAgentLoop.mockRejectedValue(new Error('API timeout'));
    await expect(runAgent({ userId: 'u1', userMessage: 'Hi', provider: 'anthropic' }))
      .rejects.toMatchObject({ code: 'AGENT_ERROR' });
    expect(history.updateRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'failed' }));
  });
});
