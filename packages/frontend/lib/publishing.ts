import { SchedioClient } from '@schedio/sdk';
import { create } from 'zustand';
import { authenticatedClient } from '@/utils/api';
export const schedio = new SchedioClient((method, path, body) => {
  switch (method) {
    case 'GET':
      return authenticatedClient.get(path);
    case 'POST':
      return authenticatedClient.post(path, body);
    case 'PUT':
      return authenticatedClient.put(path, body);
    case 'DELETE':
      return authenticatedClient.delete(path);
  }
});
export const usePublishingWorkspace = create<{
  organizationId: string | undefined;
  select: (id: string | undefined) => void;
}>((set) => ({ organizationId: undefined, select: (organizationId) => set({ organizationId }) }));
export function publishingError(error: unknown) {
  const value = error as {
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };
  return (
    value.response?.data?.error?.message ?? value.message ?? 'The request could not be completed'
  );
}
