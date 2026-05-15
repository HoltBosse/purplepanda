import type { AstroSession } from 'astro';

export function createFormFlashSession(session: AstroSession | undefined) {
  const key = (formId: string) => `form:${formId}`;

  return {
    get: async (formId: string): Promise<Record<string, string> | null> =>
      (await session?.get(key(formId))) ?? null,

    set: (formId: string, data: Record<string, string>): Promise<void> =>
      session?.set(key(formId), data) ?? Promise.resolve(),

    delete: (formId: string): Promise<void> =>
      session?.delete(key(formId)) ?? Promise.resolve(),
  };
}
