// src/modules/agent-spawner.ts
// ================================================================
// MODULE 6: AGENT SPAWNER & TEAM COORDINATOR
// Spawn specialized sub-agents, coordinate via message bus (A2A),
// parallel execution with p-queue, result aggregation.
// Pattern: Lead agent spawns teammates → they work in parallel
// → lead collects results → synthesizes final answer.
// ================================================================

import { v4 as uuid }   from 'uuid';
import PQueue            from 'p-queue';
import { EventEmitter }  from 'eventemitter3';
import { Logger }        from './logger.js';
import { registerAgent } from './memory.js';
import type {
  SubAgent, AgentTeam, AgentTask, AgentResult, LLMProvider,
} from '../types/index.js';

const log = new Logger('agent-spawner');

// ── AGENT MESSAGE BUS (A2A) ───────────────────────────────────────
// Agents communicate via this shared event bus
const messageBus = new EventEmitter();

// Live agent registry (in-memory for fast access)
const liveAgents = new Map<string, SubAgent>();
const liveTeams  = new Map<string, AgentTeam>();

// Parallel execution queue — max 4 agents at once
const execQueue = new PQueue({ concurrency: 4 });

// ── AGENT ROLES ───────────────────────────────────────────────────
const ROLE_PROMPTS: Record<string, string> = {
  researcher: 'You are a research specialist. Find accurate, current information on the given topic. Use web search extensively. Return structured findings.',
  analyst:    'You are a data analyst. Analyze the information provided and return insights, patterns, and recommendations.',
  writer:     'You are a content writer. Create clear, well-structured written content based on the provided information.',
  coder:      'You are a software engineer. Write clean, working code with explanations.',
  summarizer: 'You are a summarization specialist. Distill complex information into concise, accurate summaries.',
  planner:    'You are a strategic planner. Break down complex goals into actionable steps and identify dependencies.',
  reviewer:   'You are a critical reviewer. Identify issues, risks, and improvements in the provided content.',
  monitor:    'You are a monitoring agent. Watch for status changes, completion conditions, or errors and report findings.',
  financial:  'You are a financial analyst. Analyze financial data, transactions, and provide recommendations.',
};

// ── SPAWN A SINGLE SUB-AGENT ──────────────────────────────────────
export async function spawnSubAgent(params: {
  role:         string;
  instruction:  string;
  model:        LLMProvider;
  parentTaskId: string;
  teamId?:      string;
  context?:     Record<string, unknown>;
}): Promise<AgentResult> {
  const agentId = `agent-${params.role.slice(0, 8)}-${uuid().slice(0, 8)}`;

  const subAgent: SubAgent = {
    id:        agentId,
    role:      params.role,
    model:     params.model,
    status:    'idle',
    createdAt: new Date(),
  };

  liveAgents.set(agentId, subAgent);
  registerAgent({
    id:       agentId,
    role:     params.role,
    model:    params.model,
    status:   'idle',
    parentId: params.parentTaskId,
    teamId:   params.teamId,
  });

  log.info('AGENT_SPAWNED', `Spawned sub-agent: ${params.role} (${agentId})`, {
    agentId,
    role:     params.role,
    model:    params.model,
    parentTask: params.parentTaskId,
    teamId:   params.teamId,
  });

  // Broadcast spawn to bus
  messageBus.emit('agent:spawned', { agentId, role: params.role, teamId: params.teamId });

  // Build the sub-agent's task
  const rolePrompt  = ROLE_PROMPTS[params.role] ?? `You are a ${params.role} specialist agent.`;
  const fullPrompt  = `${rolePrompt}\n\n${params.instruction}`;

  const task: AgentTask = {
    id:          uuid(),
    type:        'general',
    instruction: fullPrompt,
    context:     {
      agentId,
      role:     params.role,
      llm:      params.model,
      isSubAgent: true,
      parentTaskId: params.parentTaskId,
      ...params.context,
    },
    priority:    'normal',
    createdAt:   new Date(),
    requestedBy: `agent:${agentId}`,
  };

  // Update status
  subAgent.status = 'running';
  subAgent.task   = task;
  liveAgents.set(agentId, subAgent);
  registerAgent({ id: agentId, role: params.role, model: params.model, status: 'running' });

  let result: AgentResult;
  try {
    // Execute inside queue to limit parallelism
    result = await execQueue.add(async () => {
      const { processTask } = await import('./brain.js');
      return processTask(task);
    }) as AgentResult;

    subAgent.status = 'done';
    subAgent.result = result;

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    result = {
      taskId:    task.id,
      success:   false,
      output:    `Sub-agent ${params.role} failed: ${error}`,
      error,
      duration:  0,
      llmUsed:   params.model,
      toolsUsed: [],
    };
    subAgent.status = 'error';
  }

  liveAgents.set(agentId, subAgent);
  registerAgent({ id: agentId, role: params.role, model: params.model, status: subAgent.status });

  // Broadcast result to bus
  messageBus.emit('agent:result', { agentId, role: params.role, result, teamId: params.teamId });

  log.info('TASK_COMPLETE', `Sub-agent done: ${params.role} (${agentId})`, {
    success:  result.success,
    duration: result.duration,
  });

  return result;
}

// ── SPAWN A TEAM OF AGENTS ────────────────────────────────────────
// Lead agent breaks work into roles, spawns parallel agents,
// then Claude synthesizes all results.
export async function spawnAgentTeam(params: {
  goal:         string;
  roles:        Array<{ role: string; instruction: string; model?: LLMProvider }>;
  parentTaskId: string;
}): Promise<{
  teamId:   string;
  goal:     string;
  results:  Array<{ role: string; result: AgentResult }>;
  synthesis: string;
}> {
  const teamId = `team-${uuid().slice(0, 12)}`;
  const team: AgentTeam = {
    id:        teamId,
    lead:      'orchestrator',
    members:   [],
    goal:      params.goal,
    status:    'forming',
    createdAt: new Date(),
  };
  liveTeams.set(teamId, team);

  log.info('AGENT_SPAWNED', `Spawning agent team: ${teamId}`, {
    teamId,
    goal:      params.goal.slice(0, 100),
    roleCount: params.roles.length,
  });

  team.status = 'working';
  liveTeams.set(teamId, team);

  // Spawn all agents in parallel (queue limits concurrency)
  const agentPromises = params.roles.map(roleConfig =>
    spawnSubAgent({
      role:         roleConfig.role,
      instruction:  roleConfig.instruction,
      model:        roleConfig.model ?? 'ollama', // Use local Ollama for sub-agents by default
      parentTaskId: params.parentTaskId,
      teamId,
    }).then(result => ({ role: roleConfig.role, result }))
  );

  const results = await Promise.all(agentPromises);

  // Claude synthesizes all results into final answer
  const synthesisPrompt = `
You are the lead orchestrator of an agent team that just completed work on:
GOAL: ${params.goal}

Here are the results from each specialized agent:

${results.map(r => `
## ${r.role.toUpperCase()} AGENT:
${r.result.success ? r.result.output : `ERROR: ${r.result.error}`}
`).join('\n---\n')}

Please synthesize these results into a single, coherent, comprehensive response that fully addresses the original goal.
Reconcile any conflicts. Surface the most important insights. Be specific and actionable.`;

  const { processTask } = await import('./brain.js');
  const synthesisResult = await processTask({
    id:          uuid(),
    type:        'general',
    instruction: synthesisPrompt,
    context:     { llm: 'claude', isTeamSynthesis: true, teamId },
    priority:    'high',
    createdAt:   new Date(),
    requestedBy: `team:${teamId}`,
  });

  team.status = 'done';
  liveTeams.set(teamId, team);

  log.info('TASK_COMPLETE', `Team ${teamId} completed`, {
    teamId,
    agentCount:   results.length,
    successCount: results.filter(r => r.result.success).length,
  });

  return {
    teamId,
    goal:      params.goal,
    results,
    synthesis: synthesisResult.output,
  };
}

// ── A2A MESSAGING ─────────────────────────────────────────────────
// Agents can send direct messages to other agents
export function sendAgentMessage(
  fromAgentId: string,
  toAgentId:   string,
  message:     string,
): void {
  log.info('AGENT_MESSAGE', `A2A: ${fromAgentId} → ${toAgentId}`, {
    from: fromAgentId, to: toAgentId, preview: message.slice(0, 100),
  });
  messageBus.emit(`message:${toAgentId}`, { from: fromAgentId, message });
}

export function onAgentMessage(
  agentId:  string,
  handler:  (from: string, message: string) => void,
): void {
  messageBus.on(`message:${agentId}`, ({ from, message }: { from: string; message: string }) => {
    handler(from, message);
  });
}

// ── BROADCAST TO ALL AGENTS ───────────────────────────────────────
export function broadcastToTeam(
  teamId:     string,
  fromAgent:  string,
  message:    string,
): void {
  const team = liveTeams.get(teamId);
  if (!team) return;
  log.info('AGENT_MESSAGE', `Broadcast from ${fromAgent} to team ${teamId}`, {});
  messageBus.emit(`team:${teamId}`, { from: fromAgent, message });
}

// ── STATUS ────────────────────────────────────────────────────────
export function getLiveAgents(): SubAgent[] {
  return Array.from(liveAgents.values());
}

export function getLiveTeams(): AgentTeam[] {
  return Array.from(liveTeams.values());
}
