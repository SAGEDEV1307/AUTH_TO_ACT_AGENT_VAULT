require('../../setup');

jest.mock('../../../services/blockchain/wallet', () => ({
  getWalletForUser: jest.fn(),
}));
jest.mock('../../../lib/database', () => ({ query: jest.fn() }));

const walletService = require('../../../services/blockchain/wallet');
const db = require('../../../lib/database');
const { sendTransaction, getTransactionHistory } = require('../../../services/blockchain/transactions');

describe('getTransactionHistory', () => {
  it('returns paginated results from DB', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ tx_hash: '0xabc', status: 'confirmed', value_ether: '0.1', chain_id: 1, from_address: '0x1', to_address: '0x2', created_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });
    const result = await getTransactionHistory('u1');
    expect(result.transactions).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

describe('sendTransaction', () => {
  it('throws BlockchainError for invalid address', async () => {
    await expect(sendTransaction('u1', { to: 'not-an-address', value: '1', chainId: 1 }))
      .rejects.toMatchObject({ code: 'BLOCKCHAIN_ERROR' });
  });
});
