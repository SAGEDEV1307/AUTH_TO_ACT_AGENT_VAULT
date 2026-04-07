// src/modules/scheduler.ts
// ================================================================
// MODULE 13: TASK SCHEDULER
// Schedule tasks to run at specific times or on cron schedules.
// Agent can schedule its own future tasks.
// ================================================================

import cron        from 'node-cron';
import { v4 as uuid } from 'uuid';
import { Logger }  from './logger.js';
import { storeMemory } from './memory.js';

const log = new Logger('scheduler');

interface ScheduledJob {
  id:          string;
  instruction: string;
  when:        string;
  repeat:      boolean;
  task?:       cron.ScheduledTask;
  nextRun?:    Date;
  createdAt:   Date;
}

const jobs = new Map<string, ScheduledJob>();

// ── SCHEDULE A TASK ───────────────────────────────────────────────
export async function scheduleTask(params: {
  instruction: string;
  when:        string;   // cron expression OR ISO date string
  repeat:      boolean;
}): Promise<string> {
  const jobId = uuid();

  // Determine if this is a cron expression or a one-time date
  const isCron     = /^[\d*,/\-\s]+$/.test(params.when.trim()) || params.when.includes('*');
  const isISODate  = !isCron && !isNaN(Date.parse(params.when));

  log.info('TOOL_CALL', `Scheduling task: ${params.instruction.slice(0, 80)}`, {
    jobId,
    when:   params.when,
    repeat: params.repeat,
    isCron,
  });

  const job: ScheduledJob = {
    id:          jobId,
    instruction: params.instruction,
    when:        params.when,
    repeat:      params.repeat,
    createdAt:   new Date(),
  };

  if (isCron) {
    if (!cron.validate(params.when)) {
      throw new Error(`Invalid cron expression: ${params.when}`);
    }

    const task = cron.schedule(params.when, async () => {
      await executeScheduledTask(job);
      if (!params.repeat) {
        task.stop();
        jobs.delete(jobId);
      }
    });

    job.task = task;
    jobs.set(jobId, job);

    log.info('TOOL_RESULT', `Cron job scheduled: ${params.when}`, { jobId });

  } else if (isISODate) {
    const runAt = new Date(params.when);
    const delay = runAt.getTime() - Date.now();

    if (delay < 0) {
      throw new Error(`Scheduled time is in the past: ${params.when}`);
    }

    job.nextRun = runAt;
    jobs.set(jobId, job);

    setTimeout(async () => {
      await executeScheduledTask(job);
      jobs.delete(jobId);
    }, delay);

    log.info('TOOL_RESULT', `One-time task scheduled for ${runAt.toISOString()}`, { jobId });

  } else {
    throw new Error(`Cannot parse schedule: ${params.when} — use cron expression or ISO date`);
  }

  storeMemory('task', `Scheduled: ${params.instruction}`, {
    jobId,
    when:   params.when,
    repeat: params.repeat,
  });

  return jobId;
}

// ── EXECUTE A SCHEDULED TASK ──────────────────────────────────────
async function executeScheduledTask(job: ScheduledJob): Promise<void> {
  log.info('TASK_RECEIVED', `Executing scheduled task: ${job.instruction.slice(0, 80)}`, {
    jobId: job.id,
  });

  try {
    const { processTask } = await import('./brain.js');
    const result = await processTask({
      id:          uuid(),
      type:        'general',
      instruction: job.instruction,
      context:     { source: 'scheduler', jobId: job.id, scheduled: true },
      priority:    'normal',
      createdAt:   new Date(),
      requestedBy: 'scheduler',
    });

    // Notify owner of scheduled task result
    const { sendMessage } = await import('./communication.js');
    await sendMessage(
      `⏰ *Scheduled Task Complete*\n\n${result.output.slice(0, 1000)}`,
    );

    log.info('TASK_COMPLETE', `Scheduled task complete: ${job.id}`, {
      success: result.success,
    });
  } catch (err) {
    log.exception(err, { context: 'scheduled_task', jobId: job.id });
  }
}

// ── LIST JOBS ─────────────────────────────────────────────────────
export function listScheduledJobs(): Array<{
  id:          string;
  instruction: string;
  when:        string;
  repeat:      boolean;
  nextRun?:    Date;
}> {
  return Array.from(jobs.values()).map(j => ({
    id:          j.id,
    instruction: j.instruction,
    when:        j.when,
    repeat:      j.repeat,
    nextRun:     j.nextRun,
  }));
}

// ── CANCEL JOB ────────────────────────────────────────────────────
export function cancelJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  job.task?.stop();
  jobs.delete(jobId);
  log.info('TASK_COMPLETE', `Scheduled job cancelled: ${jobId}`, {});
  return true;
}
