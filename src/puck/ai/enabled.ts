// Injected into editor pages by components/AiEnabledScript.astro, ahead of any editor island.
type GlobalWithAiEnabled = typeof globalThis & { __PP_AI_ENABLED?: unknown };

// In the browser: whether the server has an AI key configured (see enabled.server.ts). False when
// nothing was injected (outside the admin, or in tests), so the AI tab stays hidden.
export function getInjectedAiEnabled(): boolean {
  return (globalThis as GlobalWithAiEnabled).__PP_AI_ENABLED === true;
}
