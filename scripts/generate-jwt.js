#!/usr/bin/env node
import jwt from 'jsonwebtoken';

const [, , role = 'user', secret = process.env.JWT_SECRET || 'dev-secret', expiresIn = '1h'] = process.argv;

const payload = { role };
const token = jwt.sign(payload, secret, { expiresIn });
console.log(token);
