import { OxyServer } from '@oxy.so/core/server';
import { createAwsWorkloadCredentialProvider } from '@oxy.so/core/server/aws';

/**
 * The one Oxy client this process has. It authenticates as Schedio's registered
 * workload (the ECS task role, or a local assumed role / SSO profile); there is
 * no API key. Session-less reads go out with that service token instead of
 * anonymously. Everything else is derived from it: user clients
 * (`oxy.withUser`), account access (`oxy.accountAccessFor`), Mention
 * (`mentionForOxyService(oxy)`) and the capability authority.
 */
export const oxy = new OxyServer({
  baseURL: (process.env.OXY_API_URL ?? 'https://api.oxy.so').replace(/\/+$/, ''),
  serviceIdentity: 'when-anonymous',
  workloadCredentials: createAwsWorkloadCredentialProvider(),
});
