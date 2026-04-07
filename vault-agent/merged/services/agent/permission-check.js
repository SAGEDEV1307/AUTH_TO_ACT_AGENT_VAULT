'use strict';

const { hasPermission } = require('../../lib/permissions');
const { PERMISSIONS, TOOL_NAMES } = require('../../lib/constants');
const { AuthorizationError } = require('../../lib/errors');

// Maps tool names to required permissions
const TOOL_PERMISSION_MAP = {
  [TOOL_NAMES.WEB_SEARCH]:       PERMISSIONS.AGENT_RUN,
  [TOOL_NAMES.CODE_EXEC]:        PERMISSIONS.AGENT_RUN,
  [TOOL_NAMES.FILE_READ]:        PERMISSIONS.AGENT_RUN,
  [TOOL_NAMES.FILE_WRITE]:       PERMISSIONS.AGENT_ADMIN,
  [TOOL_NAMES.BLOCKCHAIN_READ]:  PERMISSIONS.BLOCKCHAIN_READ,
  [TOOL_NAMES.BLOCKCHAIN_SEND]:  PERMISSIONS.BLOCKCHAIN_SEND,
  [TOOL_NAMES.EMAIL_SEND]:       PERMISSIONS.AGENT_RUN,
  [TOOL_NAMES.HTTP_REQUEST]:     PERMISSIONS.AGENT_RUN,
};

async function checkToolPermission(userId, toolName) {
  const requiredPermission = TOOL_PERMISSION_MAP[toolName];
  if (!requiredPermission) {
    throw new AuthorizationError(`Unknown tool: ${toolName}`);
  }
  const allowed = await hasPermission(userId, requiredPermission);
  if (!allowed) {
    throw new AuthorizationError(`Permission denied for tool '${toolName}'. Required: ${requiredPermission}`);
  }
  return true;
}

async function checkAllToolPermissions(userId, toolNames) {
  const results = await Promise.all(
    toolNames.map(async (name) => {
      try {
        await checkToolPermission(userId, name);
        return { tool: name, allowed: true };
      } catch (err) {
        return { tool: name, allowed: false, reason: err.message };
      }
    })
  );
  const denied = results.filter(r => !r.allowed);
  if (denied.length > 0) {
    throw new AuthorizationError(
      `Permission denied for tools: ${denied.map(d => d.tool).join(', ')}`
    );
  }
  return true;
}

async function filterAllowedTools(userId, tools) {
  const filtered = [];
  for (const tool of tools) {
    try {
      await checkToolPermission(userId, tool.name);
      filtered.push(tool);
    } catch {}
  }
  return filtered;
}

module.exports = { checkToolPermission, checkAllToolPermissions, filterAllowedTools };
