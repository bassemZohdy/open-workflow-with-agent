export type AutosaveSettings = {
  enabled: boolean;
  delayMs: number;
};

export const autosaveDelayOptions = [1000, 2000, 5000, 10000] as const;
export const defaultAutosaveSettings: AutosaveSettings = {
  enabled: false,
  delayMs: 2000,
};

export const autosaveStorageKey = 'studio.autosave.v1';

export function normalizeAutosaveSettings(value: unknown): AutosaveSettings {
  if (!value || typeof value !== 'object') return { ...defaultAutosaveSettings };
  const candidate = value as { enabled?: unknown; delayMs?: unknown };
  const delayMs =
    typeof candidate.delayMs === 'number' &&
    autosaveDelayOptions.includes(candidate.delayMs as never)
      ? candidate.delayMs
      : defaultAutosaveSettings.delayMs;
  return { enabled: candidate.enabled === true, delayMs };
}

export function readAutosaveSettings(storage: Storage | null): AutosaveSettings {
  if (!storage) return { ...defaultAutosaveSettings };
  try {
    const raw = storage.getItem(autosaveStorageKey);
    return raw
      ? normalizeAutosaveSettings(JSON.parse(raw) as unknown)
      : { ...defaultAutosaveSettings };
  } catch {
    return { ...defaultAutosaveSettings };
  }
}

export function writeAutosaveSettings(storage: Storage | null, settings: AutosaveSettings): void {
  if (!storage) return;
  try {
    storage.setItem(autosaveStorageKey, JSON.stringify(normalizeAutosaveSettings(settings)));
  } catch {
    // Settings are a convenience; restricted browser storage must not block editing.
  }
}
