import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { MentionPublishingClient } from '@mention/sdk';
import { Account, ConnectionInput, ConnectionFinish } from '@schedio/contracts';
import { getDb, type SchedioTransaction } from '../db';
import { oauthStates, socialAccounts } from '../db/schema';
import { encryptSocialToken, decryptSocialToken } from '../utils/tokenCipher';
import { instanceOrigin, upstreamJson } from './network';
import { PublishingError } from './errors';
import type { Scope } from './postService';
const secretsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string().optional(),
  verifier: z.string(),
  redirectUri: z.url(),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().positive().optional(),
  scope: z.string().optional(),
});
const OXY = 'https://api.oxy.so';
const RESOURCE = 'https://mcp.mention.earth';
const MENTION_SCOPE = 'social.accounts.read social.posts.publish';
const MASTODON_SCOPE = 'read:accounts write:statuses';
function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function cipher(value: string, id: string) {
  return encryptSocialToken(value, { accountId: id, kind: 'access' });
}
export function accountDto(row: typeof socialAccounts.$inferSelect) {
  return Account.parse(row);
}
export async function listAccounts(scope: Scope) {
  const rows = await getDb()
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.isActive, true),
        scope.organizationId
          ? eq(socialAccounts.organizationId, scope.organizationId)
          : and(eq(socialAccounts.userId, scope.userId), isNull(socialAccounts.organizationId)),
      ),
    );
  return {
    items: rows
      .filter((a) => a.platform === 'mention' || a.platform === 'mastodon')
      .map(accountDto),
    nextCursor: null,
  };
}
export async function startConnection(
  scope: Scope,
  raw: unknown,
  provider: ConnectionProvider = defaultProvider,
) {
  const input = ConnectionInput.parse(raw);
  const instance =
    input.platform === 'mention'
      ? 'https://api.mention.earth'
      : instanceOrigin(input.instance ?? '');
  const redirectUri = process.env.SOCIAL_OAUTH_REDIRECT_URI;
  if (!redirectUri || new URL(redirectUri).protocol !== 'https:')
    throw new PublishingError(503, 'service_unavailable', 'OAuth callback is not configured');
  const state = randomBytes(32).toString('base64url'),
    stateHash = hash(state),
    verifier = randomBytes(48).toString('base64url');
  const registration = await provider.json(
    input.platform === 'mention' ? `${OXY}/auth/mcp/oauth/register` : `${instance}/api/v1/apps`,
    {
      method: 'POST',
      body:
        input.platform === 'mention'
          ? {
              client_name: 'Schedio',
              redirect_uris: [redirectUri],
              grant_types: ['authorization_code', 'refresh_token'],
              response_types: ['code'],
              token_endpoint_auth_method: 'none',
            }
          : {
              client_name: 'Schedio',
              redirect_uris: redirectUri,
              scopes: MASTODON_SCOPE,
              website: 'https://schedio.app',
            },
    },
  );
  if (registration.status >= 400)
    throw new PublishingError(422, 'validation_failed', 'The server could not register Schedio');
  const client = z
    .object({ client_id: z.string(), client_secret: z.string().optional() })
    .parse(registration.body);
  let authorizationEndpoint = `${instance}/oauth/authorize`;
  if (input.platform === 'mention') {
    const discovery = await provider.json(`${OXY}/.well-known/oauth-authorization-server`);
    authorizationEndpoint = z
      .object({ authorization_endpoint: z.url() })
      .parse(discovery.body).authorization_endpoint;
    const host = new URL(authorizationEndpoint).origin;
    if (host !== 'https://auth.oxy.so' && host !== OXY)
      throw new Error('Unexpected Oxy authorization origin');
  }
  const url = new URL(authorizationEndpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: redirectUri,
    scope: input.platform === 'mention' ? MENTION_SCOPE : MASTODON_SCOPE,
    state,
    code_challenge: hashChallenge(verifier),
    code_challenge_method: 'S256',
    ...(input.platform === 'mention' ? { resource: RESOURCE } : {}),
  }).toString();
  await getDb()
    .insert(oauthStates)
    .values({
      stateHash,
      userId: scope.userId,
      organizationId: scope.organizationId,
      platform: input.platform,
      instance,
      secretsCiphertext: cipher(
        JSON.stringify({
          clientId: client.client_id,
          clientSecret: client.client_secret,
          verifier,
          redirectUri,
        }),
        stateHash,
      ),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
  return { authorizationUrl: url.href, state };
}
function hashChallenge(value: string) {
  return createHash('sha256').update(value).digest('base64url');
}
async function identify(platform: string, instance: string, token: string) {
  if (platform === 'mention') {
    const me = await new MentionPublishingClient({ accessToken: token }).identity();
    return { id: me.oxyUserId, username: me.handle };
  }
  const response = await upstreamJson(`${instance}/api/v1/accounts/verify_credentials`, { token });
  if (response.status !== 200)
    throw new PublishingError(422, 'validation_failed', 'Provider authorization failed');
  return z.object({ id: z.string(), username: z.string() }).parse(response.body);
}
export async function finishConnection(
  scope: Scope,
  raw: unknown,
  provider: ConnectionProvider = defaultProvider,
) {
  const input = ConnectionFinish.parse(raw);
  const stateHash = hash(input.state);
  return getDb().transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(oauthStates)
      .where(and(eq(oauthStates.stateHash, stateHash), eq(oauthStates.userId, scope.userId)))
      .for('update');
    if (!state || state.expiresAt < new Date() || state.organizationId !== scope.organizationId)
      throw new PublishingError(
        400,
        'bad_request',
        'Connection request expired or belongs to another workspace',
      );
    const secret = secretsSchema.parse(
      JSON.parse(
        decryptSocialToken(state.secretsCiphertext, { accountId: stateHash, kind: 'access' }),
      ),
    );
    const result = await provider.json(
      state.platform === 'mention'
        ? `${OXY}/auth/mcp/oauth/token`
        : `${state.instance}/oauth/token`,
      {
        method: 'POST',
        form: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: secret.clientId,
          ...(secret.clientSecret ? { client_secret: secret.clientSecret } : {}),
          redirect_uri: secret.redirectUri,
          code: input.code,
          code_verifier: secret.verifier,
          ...(state.platform === 'mention' ? { resource: RESOURCE } : {}),
        }),
      },
    );
    if (result.status !== 200)
      throw new PublishingError(
        422,
        'validation_failed',
        'Provider did not authorize this connection; reconnect',
      );
    const token = tokenSchema.parse(result.body);
    const identity = await provider.identify(state.platform, state.instance, token.access_token);
    // A destination must be the selected Oxy organization for an organization connection.
    if (state.platform === 'mention' && identity.id !== (scope.organizationId ?? scope.userId))
      throw new PublishingError(
        403,
        'forbidden',
        'Authorize the Mention account for this workspace',
      );
    const existing = await tx.query.socialAccounts.findFirst({
      where: and(
        eq(socialAccounts.userId, scope.userId),
        eq(socialAccounts.platform, state.platform),
        eq(socialAccounts.platformUserId, `${state.instance}|${identity.id}`),
      ),
    });
    const id = existing?.id ?? randomUUID();
    const values = {
      id,
      userId: scope.userId,
      organizationId: scope.organizationId,
      platform: state.platform,
      instance: state.instance,
      platformUserId: `${state.instance}|${identity.id}`,
      platformUsername: identity.username,
      oauthClientId: secret.clientId,
      oauthClientSecretCiphertext: secret.clientSecret ? cipher(secret.clientSecret, id) : null,
      accessTokenCiphertext: cipher(token.access_token, id),
      refreshTokenCiphertext: token.refresh_token
        ? encryptSocialToken(token.refresh_token, { accountId: id, kind: 'refresh' })
        : null,
      tokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
      isActive: true,
      updatedAt: new Date(),
    };
    const [row] = existing
      ? await tx.update(socialAccounts).set(values).where(eq(socialAccounts.id, id)).returning()
      : await tx.insert(socialAccounts).values(values).returning();
    await tx.delete(oauthStates).where(eq(oauthStates.stateHash, stateHash));
    if (!row) throw new Error('Missing connection');
    return accountDto(row);
  });
}
/** Lock the credential while rotating a refresh token, preventing parallel refresh reuse. */
export async function usableAccount(
  tx: SchedioTransaction,
  accountId: string,
  provider: ConnectionProvider = defaultProvider,
) {
  const [account] = await tx
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.id, accountId))
    .for('update');
  if (!account?.isActive) throw new PublishingError(409, 'conflict', 'Destination disconnected');
  if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now() + 60000) {
    if (!account.refreshTokenCiphertext || !account.oauthClientId)
      throw new PublishingError(409, 'conflict', 'Reconnect the destination');
    const refresh = decryptSocialToken(account.refreshTokenCiphertext, {
      accountId,
      kind: 'refresh',
    });
    const result = await provider.json(
      account.platform === 'mention'
        ? `${OXY}/auth/mcp/oauth/token`
        : `${account.instance}/oauth/token`,
      {
        method: 'POST',
        form: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refresh,
          client_id: account.oauthClientId,
          ...(account.oauthClientSecretCiphertext
            ? {
                client_secret: decryptSocialToken(account.oauthClientSecretCiphertext, {
                  accountId,
                  kind: 'access',
                }),
              }
            : {}),
          ...(account.platform === 'mention' ? { resource: RESOURCE } : {}),
        }),
      },
    );
    if (result.status !== 200)
      throw new PublishingError(409, 'conflict', 'Reconnect the destination');
    const token = tokenSchema.parse(result.body);
    account.accessTokenCiphertext = cipher(token.access_token, accountId);
    account.refreshTokenCiphertext = token.refresh_token
      ? encryptSocialToken(token.refresh_token, { accountId, kind: 'refresh' })
      : account.refreshTokenCiphertext;
    account.tokenExpiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000)
      : null;
    await tx
      .update(socialAccounts)
      .set({
        accessTokenCiphertext: account.accessTokenCiphertext,
        refreshTokenCiphertext: account.refreshTokenCiphertext,
        tokenExpiresAt: account.tokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, accountId));
  }
  return account;
}
export async function disconnect(scope: Scope, id: string) {
  await getDb().transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.id, id),
          scope.organizationId
            ? eq(socialAccounts.organizationId, scope.organizationId)
            : and(eq(socialAccounts.userId, scope.userId), isNull(socialAccounts.organizationId)),
        ),
      )
      .for('update');
    if (!account) throw new PublishingError(404, 'not_found', 'Account not found');
    await tx
      .update(socialAccounts)
      .set({
        isActive: false,
        accessTokenCiphertext: cipher('disconnected', id),
        refreshTokenCiphertext: null,
        oauthClientSecretCiphertext: null,
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, id));
  });
}

export interface ConnectionProvider {
  json: typeof upstreamJson;
  identify: typeof identify;
}
const defaultProvider: ConnectionProvider = { json: upstreamJson, identify };
