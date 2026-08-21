import { describe, expect, it } from 'vitest';

import {
  defaultAutosaveSettings,
  normalizeAutosaveSettings,
  readAutosaveSettings,
  writeAutosaveSettings,
} from './autosave';

describe('autosave settings', () => {
  it('defaults to disabled and normalizes unsupported delays', () => {
    expect(normalizeAutosaveSettings({ enabled: true, delayMs: 300 })).toEqual({
      enabled: true,
      delayMs: defaultAutosaveSettings.delayMs,
    });
    expect(normalizeAutosaveSettings({ enabled: true, delayMs: 5000 })).toEqual({
      enabled: true,
      delayMs: 5000,
    });
  });

  it('round-trips settings through browser storage', () => {
    const storage = new Map<string, string>();
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } as unknown as Storage;
    writeAutosaveSettings(fakeStorage, { enabled: true, delayMs: 10000 });
    expect(readAutosaveSettings(fakeStorage)).toEqual({ enabled: true, delayMs: 10000 });
  });
});
