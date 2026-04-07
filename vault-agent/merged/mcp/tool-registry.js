'use strict';

const mcpServer = require('../services/mcp/server');
const { executeTool, TOOL_DEFINITIONS } = require('../services/agent/tool-executor');
const logger = require('../lib/logger');

// Register all available tools into the MCP server
function registerAllTools() {
  for (const toolDef of TOOL_DEFINITIONS) {
    mcpServer.registerTool(
      toolDef.name,
      toolDef.description,
      toolDef.input_schema,
      async (args, context) => {
        return executeTool(toolDef.name, args, context);
      }
    );
  }
  logger.info('All tools registered in MCP server', { count: TOOL_DEFINITIONS.length });
}

module.exports = { registerAllTools };
