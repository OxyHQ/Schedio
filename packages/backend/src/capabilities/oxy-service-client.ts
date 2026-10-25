import { OxyServer } from '@oxy.so/core/server';
import { createAwsWorkloadCredentialProvider } from '@oxy.so/core/server/aws';

export const OXY_API_URL = (process.env.OXY_API_URL ?? 'https://api.oxy.so').replace(/\/$/, '');
let client: OxyServer | undefined;
/** Registered temporary workload credentials, including local assumed roles and SSO. */
export function oxyServiceClient(): OxyServer {
  client ??= new OxyServer({
    baseURL: OXY_API_URL,
    workloadCredentials: createAwsWorkloadCredentialProvider(),
  });
  return client;
}
export function oxyAuthorityTransport() {
  return oxyServiceClient().createServiceClient({ baseURL: OXY_API_URL, audience: 'oxy-api' });
}
export function resetOxyServiceClientForTests(): void {
  client?.dispose();
  client = undefined;
}
