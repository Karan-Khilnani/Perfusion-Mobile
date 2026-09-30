const CALLBACK_INSTALLATION_KEY = "perfusion-callback-installation-id";

export function getCallbackInstallationId(): string {
  const existing = window.localStorage.getItem(CALLBACK_INSTALLATION_KEY);
  if (existing) return existing;
  const installationId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `installation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(CALLBACK_INSTALLATION_KEY, installationId);
  return installationId;
}