// src/modules/communication.ts
// ================================================================
// MODULE 10: COMMUNICATION
// Telegram (primary) — bidirectional, inline keyboards for HITL
// SMS via Twilio — backup alerts
// Email via Nodemailer — reports
// All channels can receive tasks AND send HITL approvals.
// ================================================================

import TelegramBot   from 'node-telegram-bot-api';
import twilio        from 'twilio';
import nodemailer    from 'nodemailer';
import { config }    from '../config.js';
import { Logger }    from './logger.js';
import { setHITLNotifyFn, resolveHITLRequest, getPendingHITLRequests } from './hitl.js';
import { storeConversation }  from './memory.js';
import type { HITLRequest }   from '../types/index.js';

const log = new Logger('communication');

// ── TELEGRAM BOT ─────────────────────────────────────────────────
let telegramBot: TelegramBot | null = null;

function getTelegram(): TelegramBot | null {
  if (!config.telegram.botToken) return null;
  if (!telegramBot) {
    telegramBot = new TelegramBot(config.telegram.botToken, { polling: true });
    log.info('SYSTEM_START', 'Telegram bot started (polling)', {});
  }
  return telegramBot;
}

// ── TWILIO SMS ────────────────────────────────────────────────────
let twilioClient: ReturnType<typeof twilio> | null = null;

function getTwilio(): ReturnType<typeof twilio> | null {
  if (!config.twilio.accountSid || !config.twilio.authToken) return null;
  if (!twilioClient) {
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

// ── EMAIL TRANSPORTER ─────────────────────────────────────────────
let emailTransporter: nodemailer.Transporter | null = null;

function getEmailTransporter(): nodemailer.Transporter | null {
  if (!config.email.smtpUser) return null;
  if (!emailTransporter) {
    emailTransporter = nodemailer.createTransport({
      host:   config.email.smtpHost,
      port:   config.email.smtpPort,
      secure: false,
      auth: {
        user: config.email.smtpUser,
        pass: config.email.smtpPass,
      },
    });
  }
  return emailTransporter;
}

// ── SEND MESSAGE — All Channels ───────────────────────────────────
export async function sendMessage(
  text:      string,
  channels?: Array<'telegram' | 'sms' | 'email'>,
): Promise<void> {
  const targets = channels ?? ['telegram'];

  await Promise.allSettled(targets.map(async channel => {
    try {
      switch (channel) {
        case 'telegram': {
          const bot = getTelegram();
          if (bot && config.telegram.ownerChatId) {
            await bot.sendMessage(config.telegram.ownerChatId, text, {
              parse_mode: 'Markdown',
            });
          }
          break;
        }
        case 'sms': {
          const tw = getTwilio();
          if (tw && config.twilio.ownerPhone) {
            await tw.messages.create({
              body: text.slice(0, 1600),   // SMS limit
              from: config.twilio.fromNumber,
              to:   config.twilio.ownerPhone,
            });
          }
          break;
        }
        case 'email': {
          const transporter = getEmailTransporter();
          if (transporter && config.email.ownerEmail) {
            await transporter.sendMail({
              from:    config.email.smtpUser,
              to:      config.email.ownerEmail,
              subject: `${config.agentName} Message`,
              text,
            });
          }
          break;
        }
      }
    } catch (err) {
      log.exception(err, { channel, context: 'send_message' });
    }
  }));
}

// ── HITL NOTIFICATION ─────────────────────────────────────────────
// Sends interactive Telegram message with approve/deny buttons
async function notifyHITL(request: HITLRequest): Promise<void> {
  const bot = getTelegram();
  const riskEmoji = {
    low:      '🟢',
    medium:   '🟡',
    high:     '🟠',
    critical: '🔴',
  }[request.riskLevel];

  const message = `
${riskEmoji} *APPROVAL REQUIRED*

*Action:* ${request.action}
*Description:* ${request.description}
*Risk Level:* ${request.riskLevel.toUpperCase()}
*Request ID:* \`${request.id}\`
*Expires:* ${request.expiresAt.toLocaleTimeString()}

*Details:*
\`\`\`json
${JSON.stringify(request.data, null, 2).slice(0, 500)}
\`\`\`
  `.trim();

  // Send with inline keyboard buttons
  if (bot && config.telegram.ownerChatId) {
    try {
      await bot.sendMessage(config.telegram.ownerChatId, message, {
        parse_mode:   'Markdown',
        reply_markup: {
          inline_keyboard: [[
            {
              text:          '✅ APPROVE',
              callback_data: `hitl:approve:${request.id}`,
            },
            {
              text:          '❌ DENY',
              callback_data: `hitl:deny:${request.id}`,
            },
          ]],
        },
      });
    } catch (err) {
      log.exception(err, { context: 'hitl_notify_telegram' });
    }
  }

  // SMS backup for critical actions
  if (request.riskLevel === 'critical') {
    try {
      await sendMessage(
        `⚠️ CRITICAL APPROVAL NEEDED: ${request.action}\n${request.description}\nReply via Telegram. Expires: ${request.expiresAt.toLocaleTimeString()}`,
        ['sms'],
      );
    } catch (err) {
      log.exception(err, { context: 'hitl_notify_sms' });
    }
  }
}

// ── HANDLE TELEGRAM CALLBACK QUERIES (button presses) ────────────
function setupTelegramCallbacks(bot: TelegramBot): void {
  // Handle inline keyboard button presses (HITL approve/deny)
  bot.on('callback_query', async (query) => {
    const data = query.data ?? '';

    if (data.startsWith('hitl:')) {
      const [, decision, requestId] = data.split(':') as [string, string, string];
      const chatId = query.message?.chat.id.toString();

      if (!requestId || !decision) return;

      const resolved = resolveHITLRequest(
        requestId,
        decision as 'approve' | 'deny',
        '',
        `telegram:${query.from.username ?? query.from.id}`,
      );

      const responseText = resolved
        ? `${decision === 'approve' ? '✅' : '❌'} ${decision.toUpperCase()}D: ${resolved.action}`
        : '⚠️ Request not found or already resolved';

      // Answer the callback query
      await bot.answerCallbackQuery(query.id, { text: responseText });

      // Edit the original message to show the decision
      if (query.message && chatId) {
        await bot.editMessageText(
          `${responseText}\nDecided by: @${query.from.username ?? 'unknown'}`,
          {
            chat_id:    chatId,
            message_id: query.message.message_id,
          },
        );
      }
    }
  });

  // Handle text messages — treat as tasks
  bot.on('message', async (msg) => {
    if (!msg.text) return;

    // Only accept messages from owner
    const isOwner = msg.chat.id.toString() === config.telegram.ownerChatId;
    if (!isOwner) {
      await bot.sendMessage(msg.chat.id, '🚫 Unauthorized');
      log.security('UNAUTHORIZED_TELEGRAM', { chatId: msg.chat.id, user: msg.from?.username });
      return;
    }

    const text = msg.text.trim();
    log.info('TASK_RECEIVED', `Telegram message: ${text.slice(0, 100)}`, {
      chatId: msg.chat.id,
    });

    storeConversation('telegram', 'user', text);

    // Special commands
    if (text === '/status') {
      await handleStatusCommand(bot, msg.chat.id);
      return;
    }

    if (text === '/pending') {
      await handlePendingCommand(bot, msg.chat.id);
      return;
    }

    if (text === '/help') {
      await bot.sendMessage(msg.chat.id, `
*${config.agentName} Commands:*

Send me any instruction and I'll execute it.

/status — Show agent status + balances
/pending — Show pending HITL approvals
/help — Show this help

*Examples:*
• "Watch this video and summarize it: [URL]"
• "Check my bank balance"
• "What's my crypto wallet balance?"
• "Research the latest AI news"
• "Spawn 3 agents to analyze X topic"
      `.trim(), { parse_mode: 'Markdown' });
      return;
    }

    // Route to brain
    try {
      await bot.sendMessage(msg.chat.id, '⏳ Processing...', {});

      const { processTask } = await import('./brain.js');
      const { v4: uuidv4 }  = await import('uuid');

      const result = await processTask({
        id:          uuidv4(),
        type:        'general',
        instruction: text,
        context:     { source: 'telegram', chatId: msg.chat.id },
        priority:    'normal',
        createdAt:   new Date(),
        requestedBy: 'telegram',
      });

      storeConversation('telegram', 'assistant', result.output);

      // Split long messages (Telegram max 4096 chars)
      const chunks = result.output.match(/.{1,4000}/gs) ?? [result.output];
      for (const chunk of chunks) {
        await bot.sendMessage(msg.chat.id, chunk, { parse_mode: 'Markdown' });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await bot.sendMessage(msg.chat.id, `❌ Error: ${error}`);
    }
  });
}

// ── COMMAND HANDLERS ──────────────────────────────────────────────
async function handleStatusCommand(bot: TelegramBot, chatId: number): Promise<void> {
  try {
    const { getBalanceSummary } = await import('./banking.js');
    const { getWalletStatus }   = await import('./crypto-wallet.js');

    const [bankStatus, walletStatus] = await Promise.allSettled([
      getBalanceSummary(),
      getWalletStatus(),
    ]);

    const bankText = bankStatus.status === 'fulfilled'
      ? `💰 Bank: $${bankStatus.value.totalBalanceUSD.toFixed(2)}`
      : '💰 Bank: unavailable';

    const cryptoText = walletStatus.status === 'fulfilled'
      ? `🔷 ETH: ${walletStatus.value.ethBalance} ETH ($${walletStatus.value.usdValue.toFixed(2)})`
      : '🔷 ETH: unavailable';

    await bot.sendMessage(chatId, `
*${config.agentName} Status*

${bankText}
${cryptoText}
🤖 LLM: ${config.llm.defaultProvider} (${config.llm.claudeModel})
⏱ Running: ✅
    `.trim(), { parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, `Status error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handlePendingCommand(bot: TelegramBot, chatId: number): Promise<void> {
  const pending = getPendingHITLRequests();
  if (pending.length === 0) {
    await bot.sendMessage(chatId, '✅ No pending approvals');
    return;
  }

  await bot.sendMessage(chatId, `⏳ *${pending.length} pending approval(s):*`, { parse_mode: 'Markdown' });

  for (const req of pending) {
    await bot.sendMessage(chatId, `*${req.action}*\n${req.description}`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ APPROVE', callback_data: `hitl:approve:${req.id}` },
          { text: '❌ DENY',    callback_data: `hitl:deny:${req.id}` },
        ]],
      },
    });
  }
}

// ── INIT COMMUNICATION ────────────────────────────────────────────
export function initCommunication(): void {
  // Register HITL notify function
  setHITLNotifyFn(notifyHITL);

  // Start Telegram bot
  const bot = getTelegram();
  if (bot) {
    setupTelegramCallbacks(bot);
    log.info('SYSTEM_START', 'Communication module initialized (Telegram)', {});

    // Send startup notification to owner
    void sendMessage(`🤖 *${config.agentName} is online*\n\nSend me instructions. Type /help for commands.`);
  } else {
    log.warn('SYSTEM_START', 'Telegram not configured — no TELEGRAM_BOT_TOKEN set', {});
  }
}
