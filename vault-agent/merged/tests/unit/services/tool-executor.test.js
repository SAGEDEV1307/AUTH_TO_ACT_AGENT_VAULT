require('../../setup');

jest.mock('../../../services/agent/permission-check', () => ({
  checkToolPermission: jest.fn().mockResolvedValue(true),
}));

const { executeTool, TOOL_DEFINITIONS } = require('../../../services/agent/tool-executor');

describe('TOOL_DEFINITIONS', () => {
  it('exports an array of tool definitions', () => {
    expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);
  });
  it('each tool has name, description, input_schema', () => {
    for (const t of TOOL_DEFINITIONS) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.input_schema).toBeDefined();
    }
  });
});

describe('executeTool', () => {
  it('throws for unknown tool', async () => {
    await expect(executeTool('nonexistent_tool', {}, {})).rejects.toThrow('not implemented');
  });

  it('throws for http_request with http:// URL', async () => {
    await expect(executeTool('http_request', { url: 'http://evil.com' }, { userId: 'u1' }))
      .rejects.toThrow('HTTPS');
  });
});
