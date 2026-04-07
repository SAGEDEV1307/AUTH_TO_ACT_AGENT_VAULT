#!/usr/bin/env node
'use strict';
const crypto = require('crypto');
const key = crypto.randomBytes(32).toString('hex');
console.log('Generated 32-byte encryption key:');
console.log(key);
console.log('\nAdd to your .env:');
console.log(`ENCRYPTION_KEY=${key}`);
