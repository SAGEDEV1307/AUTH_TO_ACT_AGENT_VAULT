'use strict';

const PERMISSIONS = {
  // Agent permissions
  AGENT_RUN:         'agent:run',
  AGENT_HISTORY:     'agent:history',
  AGENT_ADMIN:       'agent:admin',
  // Blockchain permissions
  BLOCKCHAIN_READ:   'blockchain:read',
  BLOCKCHAIN_SEND:   'blockchain:send',
  BLOCKCHAIN_ADMIN:  'blockchain:admin',
  // Key management
  KEYS_READ:         'keys:read',
  KEYS_WRITE:        'keys:write',
  KEYS_ADMIN:        'keys:admin',
  // Admin
  ADMIN:             'admin',
};

const ROLES = {
  USER:  'user',
  AGENT: 'agent',
  ADMIN: 'admin',
};

const ROLE_PERMISSIONS = {
  [ROLES.USER]: [
    PERMISSIONS.AGENT_RUN,
    PERMISSIONS.AGENT_HISTORY,
    PERMISSIONS.BLOCKCHAIN_READ,
    PERMISSIONS.KEYS_READ,
  ],
  [ROLES.AGENT]: [
    PERMISSIONS.AGENT_RUN,
    PERMISSIONS.AGENT_HISTORY,
    PERMISSIONS.BLOCKCHAIN_READ,
    PERMISSIONS.BLOCKCHAIN_SEND,
    PERMISSIONS.KEYS_READ,
  ],
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
};

const TOOL_NAMES = {
  WEB_SEARCH:       'web_search',
  CODE_EXEC:        'code_exec',
  FILE_READ:        'file_read',
  FILE_WRITE:       'file_write',
  BLOCKCHAIN_READ:  'blockchain_read',
  BLOCKCHAIN_SEND:  'blockchain_send',
  EMAIL_SEND:       'email_send',
  HTTP_REQUEST:     'http_request',
};

const AGENT_STATUS = {
  PENDING:   'pending',
  RUNNING:   'running',
  COMPLETED: 'completed',
  FAILED:    'failed',
  CANCELLED: 'cancelled',
};

const RATE_LIMITS = {
  API_WINDOW_MS:        15 * 60 * 1000,  // 15 minutes
  API_MAX_REQUESTS:     100,
  AGENT_WINDOW_MS:      60 * 60 * 1000,  // 1 hour
  AGENT_MAX_REQUESTS:   20,
  AUTH_WINDOW_MS:       15 * 60 * 1000,
  AUTH_MAX_REQUESTS:    10,
};

const TOKEN_EXPIRY = {
  ACCESS:  '1h',
  REFRESH: '7d',
  API_KEY: null,  // no expiry by default
};

const CHAINS = {
  ETHEREUM: { chainId: 1, name: 'ethereum', native: 'ETH', rpc: 'https://mainnet.infura.io/v3/{key}' },
  OPTIMISM: { chainId: 10, name: 'optimism', native: 'ETH', rpc: 'https://mainnet.optimism.io' },
  BNB: { chainId: 56, name: 'bnb', native: 'BNB', rpc: 'https://bsc-dataseed.binance.org' },
  POLYGON: { chainId: 137, name: 'polygon', native: 'POL', rpc: 'https://polygon-rpc.com' },
  MONAD: { chainId: 143, name: 'monad', native: 'MON', rpc: 'https://rpc.monad.xyz' },
  UNICHAIN: { chainId: 130, name: 'unichain', native: 'ETH', rpc: 'https://mainnet.unichain.org' },
  WORLDCHAIN: { chainId: 480, name: 'worldchain', native: 'ETH', rpc: 'https://worldchain-mainnet.g.alchemy.com/public' },
  ZKSYNC: { chainId: 324, name: 'zksync', native: 'ETH', rpc: 'https://mainnet.era.zksync.io' },
  ARBITRUM: { chainId: 42161, name: 'arbitrum', native: 'ETH', rpc: 'https://arb1.arbitrum.io/rpc' },
  AVALANCHE: { chainId: 43114, name: 'avalanche', native: 'AVAX', rpc: 'https://api.avax.network/ext/bc/C/rpc' },
  LINEA: { chainId: 59144, name: 'linea', native: 'ETH', rpc: 'https://rpc.linea.build' },
  BASE: { chainId: 8453, name: 'base', native: 'ETH', rpc: 'https://mainnet.base.org' },
  BLAST: { chainId: 81457, name: 'blast', native: 'ETH', rpc: 'https://rpc.blast.io' },
  SCROLL: { chainId: 534352, name: 'scroll', native: 'ETH', rpc: 'https://rpc.scroll.io' },
  ZORA: { chainId: 7777777, name: 'zora', native: 'ETH', rpc: 'https://rpc.zora.energy' },
  MANTLE: { chainId: 5000, name: 'mantle', native: 'MNT', rpc: 'https://rpc.mantle.xyz' },
  CELO: { chainId: 42220, name: 'celo', native: 'CELO', rpc: 'https://forno.celo.org' },
  GNOSIS: { chainId: 100, name: 'gnosis', native: 'xDAI', rpc: 'https://rpc.gnosischain.com' },
  FANTOM: { chainId: 250, name: 'fantom', native: 'FTM', rpc: 'https://rpc.ftm.tools' },
  INK: { chainId: 57073, name: 'ink', native: 'ETH', rpc: 'https://rpc-gel.inkonchain.com' },
  SONEIUM: { chainId: 1868, name: 'soneium', native: 'ETH', rpc: 'https://rpc.soneium.org' },
  MEGAETH: { chainId: 4326, name: 'megaeth', native: 'ETH', rpc: 'https://carrot.megaeth.com' },
  PEAQ: { chainId: 3338, name: 'peaq', native: 'PEAQ', rpc: 'https://mpfn1.peaq.network' },
  MOONBEAM: { chainId: 1284, name: 'moonbeam', native: 'GLMR', rpc: 'https://rpc.api.moonbeam.network' },
  STARKNET: { chainId: 'SN_MAIN', name: 'starknet', native: 'ETH', rpc: 'https://starknet-mainnet.public.blastapi.io' },
  SOLANA: { chainId: 'mainnet-beta', name: 'solana', native: 'SOL', rpc: 'https://api.mainnet-beta.solana.com' },
  NEAR: { chainId: 'mainnet', name: 'near', native: 'NEAR', rpc: 'https://rpc.mainnet.near.org' },
};

module.exports = {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  TOOL_NAMES,
  AGENT_STATUS,
  RATE_LIMITS,
  TOKEN_EXPIRY,
  CHAINS,
};
