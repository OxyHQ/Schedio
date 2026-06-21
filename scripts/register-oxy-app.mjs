#!/usr/bin/env node
/**
 * One-off: register "Schedio" as an Oxy application and mint a PUBLIC credential
 * whose `publicKey` becomes the app's OXY_CLIENT_ID (required by @oxyhq/services
 * >=10 for the web cold-boot / cross-app SSO flow).
 *
 * Auth: needs an Oxy access token for the owning account. Provide it via either
 *   - env var OXY_ACCESS_TOKEN, or
 *   - a 600-mode file at ~/.config/oxy/tokens/oxy.token (first line = token).
 *
 * Run:  node scripts/register-oxy-app.mjs
 * Output: prints the clientId (publicKey). Put it in EXPO_PUBLIC_OXY_CLIENT_ID.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { OxyServices } from '@oxyhq/core';

const API_BASE_URL = process.env.OXY_BASE_URL || 'https://api.oxy.so';

const REDIRECT_URIS = [
  'https://schedio.app/__oxy/sso-callback',
  'https://www.schedio.app/__oxy/sso-callback',
  'http://localhost:8081/__oxy/sso-callback',
];

function resolveToken() {
  if (process.env.OXY_ACCESS_TOKEN) return process.env.OXY_ACCESS_TOKEN.trim();
  try {
    const p = join(homedir(), '.config', 'oxy', 'tokens', 'oxy.token');
    return readFileSync(p, 'utf8').split('\n')[0].trim();
  } catch {
    return '';
  }
}

async function main() {
  const token = resolveToken();
  if (!token) {
    console.error(
      'No Oxy access token found. Set OXY_ACCESS_TOKEN or write ~/.config/oxy/tokens/oxy.token (mode 600).'
    );
    process.exit(1);
  }

  const oxy = new OxyServices({ baseURL: API_BASE_URL });
  await oxy.setTokens(token);

  console.log(`Creating application "Schedio" on ${API_BASE_URL} ...`);
  const app = await oxy.createApplication({
    name: 'Schedio',
    description: 'Schedio — scheduling app',
    websiteUrl: 'https://schedio.app',
    redirectUris: REDIRECT_URIS,
  });
  console.log(`  application _id: ${app._id}`);

  console.log('Minting PUBLIC production credential ...');
  const prod = await oxy.createApplicationCredential(app._id, {
    name: 'web-production',
    type: 'public',
    environment: 'production',
  });

  console.log('\n==============================================');
  console.log('OXY_CLIENT_ID (publicKey) =', prod.credential.publicKey);
  console.log('==============================================');
  console.log('\nSet it: EXPO_PUBLIC_OXY_CLIENT_ID=' + prod.credential.publicKey);
}

main().catch((err) => {
  console.error('Registration failed:', err?.response?.data ?? err?.message ?? err);
  process.exit(1);
});
