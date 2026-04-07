#!/usr/bin/env node
'use strict';
require('dotenv').config();
const db = require('../lib/database');
const { setUserRole } = require('../lib/permissions');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/create-admin.js <email>');
    process.exit(1);
  }
  const result = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (!result.rows[0]) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }
  const userId = result.rows[0].id;
  await setUserRole(userId, 'admin', userId);
  console.log(`Admin role granted to ${email} (id: ${userId})`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
