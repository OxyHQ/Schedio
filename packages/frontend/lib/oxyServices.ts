import { OxyServices } from '@oxy.so/core';
import { OXY_BASE_URL } from '@/config';

/**
 * The app's one Oxy client, passed to `OxyProvider` in AppProviders and used
 * outside React (the linked backend client, app init). The response cache is
 * off, as in the provider's own client: React Query owns caching.
 */
export const oxyServices = new OxyServices({ baseURL: OXY_BASE_URL, enableCache: false });
