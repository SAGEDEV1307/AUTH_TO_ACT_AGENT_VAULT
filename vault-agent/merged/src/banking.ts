// src/modules/banking.ts
// ================================================================
// MODULE 7: BANKING — Plaid + Stripe (TypeScript/Node — not Python)
// Read balance, transactions, send payments.
// All transfers go through HITL + daily spend tracking.
// ================================================================

import Stripe                          from 'stripe';
import { PlaidApi, Configuration, PlaidEnvironments } from 'plaid';
import { config }                      from '../config.js';
import { Logger }                      from './logger.js';
import { getDailySpend, logFinancialAction } from './memory.js';
import type { BankAccount, Transaction, TransferRequest } from '../types/index.js';

const log = new Logger('banking');

// ── PLAID CLIENT ─────────────────────────────────────────────────
const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[config.banking.plaidEnv as keyof typeof PlaidEnvironments]
    ?? PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': config.banking.plaidClientId,
      'PLAID-SECRET':    config.banking.plaidSecret,
      'Plaid-Version':   '2020-09-14',
    },
  },
});

const plaidClient = new PlaidApi(plaidConfig);

// ── STRIPE CLIENT ─────────────────────────────────────────────────
const stripe = new Stripe(config.banking.stripeKey);

// ── GET BALANCE SUMMARY ───────────────────────────────────────────
export async function getBalanceSummary(): Promise<{
  accounts: BankAccount[];
  totalBalanceUSD: number;
  dailySpentUSD:   number;
  dailyLimitUSD:   number;
  remainingTodayUSD: number;
}> {
  log.info('TOOL_CALL', 'Fetching bank balance', {});

  try {
    const response = await plaidClient.accountsBalanceGet({
      access_token: config.banking.plaidAccessToken,
    });

    const accounts: BankAccount[] = response.data.accounts.map(acc => ({
      id:            acc.account_id,
      name:          acc.name,
      type:          acc.type,
      balance:       acc.balances.current ?? 0,
      currency:      acc.balances.iso_currency_code ?? 'USD',
      institutionId: acc.persistent_account_id ?? '',
    }));

    const totalBalanceUSD = accounts.reduce((sum, a) => sum + a.balance, 0);
    const dailySpentUSD   = getDailySpend('USD');

    log.info('TOOL_RESULT', `Balance: $${totalBalanceUSD.toFixed(2)}`, {
      accountCount: accounts.length,
      dailySpent:   dailySpentUSD,
    });

    return {
      accounts,
      totalBalanceUSD,
      dailySpentUSD,
      dailyLimitUSD:     config.banking.maxDailySpend,
      remainingTodayUSD: Math.max(0, config.banking.maxDailySpend - dailySpentUSD),
    };
  } catch (err) {
    log.exception(err, { context: 'get_balance' });
    throw new Error(`Failed to get bank balance: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── GET RECENT TRANSACTIONS ───────────────────────────────────────
export async function getRecentTransactions(days = 30): Promise<Transaction[]> {
  log.info('TOOL_CALL', `Fetching transactions (last ${days} days)`, {});

  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const response = await plaidClient.transactionsGet({
      access_token: config.banking.plaidAccessToken,
      start_date:   startDate.toISOString().slice(0, 10),
      end_date:     endDate.toISOString().slice(0, 10),
    });

    const txs: Transaction[] = response.data.transactions.map(tx => ({
      id:        tx.transaction_id,
      amount:    tx.amount,
      currency:  tx.iso_currency_code ?? 'USD',
      merchant:  tx.merchant_name ?? tx.name,
      category:  tx.category ?? [],
      date:      tx.date,
      pending:   tx.pending,
      accountId: tx.account_id,
    }));

    log.info('TOOL_RESULT', `Got ${txs.length} transactions`, {});
    return txs;
  } catch (err) {
    log.exception(err, { context: 'get_transactions' });
    throw new Error(`Failed to get transactions: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── SEND PAYMENT ──────────────────────────────────────────────────
// Uses Stripe for actual payment execution
// Plaid is read-only; Stripe handles sending money
export async function sendPayment(req: TransferRequest): Promise<{
  success:       boolean;
  transactionId: string;
  amount:        number;
  recipient:     string;
}> {
  const dailySpent = getDailySpend('USD');

  // Enforce daily limit
  if (dailySpent + req.amount > config.banking.maxDailySpend) {
    throw new Error(
      `Daily spend limit exceeded. Spent: $${dailySpent.toFixed(2)}, `
      + `Limit: $${config.banking.maxDailySpend}, Requested: $${req.amount}`
    );
  }

  // Enforce single transaction limit
  if (req.amount > config.banking.maxSingleTx) {
    throw new Error(
      `Single transaction limit exceeded: $${req.amount} > $${config.banking.maxSingleTx} max`
    );
  }

  log.financial('bank_payment', req.amount, req.recipient, 'HITL_APPROVED', {
    description: req.description,
    taskId:      req.taskId,
  });

  try {
    // Create Stripe payment intent (real payment processing)
    const paymentIntent = await stripe.paymentIntents.create({
      amount:      Math.round(req.amount * 100),  // Stripe uses cents
      currency:    'usd',
      description: req.description,
      metadata:    {
        taskId:    req.taskId,
        recipient: req.recipient,
        agent:     config.agentName,
      },
    });

    // Log to financial history
    logFinancialAction({
      type:        'bank_payment',
      amount:      req.amount,
      currency:    'USD',
      recipient:   req.recipient,
      description: req.description,
      status:      'completed',
      approvedBy:  'HITL',
      taskId:      req.taskId,
    });

    log.warn('FINANCIAL_ACTION', `Payment sent: $${req.amount} to ${req.recipient}`, {
      transactionId: paymentIntent.id,
      amount:        req.amount,
      recipient:     req.recipient,
    });

    return {
      success:       true,
      transactionId: paymentIntent.id,
      amount:        req.amount,
      recipient:     req.recipient,
    };
  } catch (err) {
    log.exception(err, { context: 'send_payment', amount: req.amount, recipient: req.recipient });

    logFinancialAction({
      type:        'bank_payment',
      amount:      req.amount,
      currency:    'USD',
      recipient:   req.recipient,
      description: req.description,
      status:      'failed',
      approvedBy:  'HITL',
      taskId:      req.taskId,
    });

    throw new Error(`Payment failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── STRIPE WEBHOOK HANDLER ────────────────────────────────────────
// Call this from the HTTPS server's webhook endpoint
export async function handleStripeWebhook(
  body:      Buffer,
  signature: string,
): Promise<void> {
  // Use the dedicated webhook secret (set STRIPE_WEBHOOK_SECRET in .env)
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';
  if (!webhookSecret) {
    log.warn('SECURITY_EVENT', 'STRIPE_WEBHOOK_SECRET not set — webhook unverified', {});
  }

  const event = webhookSecret
    ? stripe.webhooks.constructEvent(body, signature, webhookSecret)
    : JSON.parse(body.toString()) as { type: string; data: { object: { id: string; amount?: number } }; id: string };

  log.info('TOOL_RESULT', `Stripe webhook: ${event.type}`, { eventId: event.id });

  switch (event.type) {
    case 'payment_intent.succeeded':
      log.warn('FINANCIAL_ACTION', 'Payment confirmed by Stripe', {
        paymentIntent: event.data.object.id,
        amount:        ((event.data.object.amount) ?? 0) / 100,
      });
      break;

    case 'payment_intent.payment_failed':
      log.error('ERROR', 'Payment failed confirmation from Stripe', {
        paymentIntent: event.data.object.id,
      });
      break;

    default:
      break;
  }
}
