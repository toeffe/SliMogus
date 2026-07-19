import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, resolveDisplayName, saveSettings } from './settings';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    key: (index) => [...map.keys()][index] ?? null,
  };
}

describe('settings', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a save/load', () => {
    saveSettings(
      { displayName: 'Red', muted: true, volume: 0.25, seenTutorial: true, characterId: 'ninja' },
      storage,
    );
    expect(loadSettings(storage)).toEqual({
      displayName: 'Red',
      muted: true,
      volume: 0.25,
      seenTutorial: true,
      characterId: 'ninja',
    });
  });

  it('falls back to default characterId for unknown ids', () => {
    const saved = saveSettings({ characterId: 'not-a-real-character' }, storage);
    expect(saved.characterId).toBe(DEFAULT_SETTINGS.characterId);
  });

  it('clamps volume and trims display names', () => {
    const saved = saveSettings(
      { displayName: '  LongNameThatExceedsTwentyFourChars  ', volume: 2 },
      storage,
    );
    expect(saved.displayName).toHaveLength(24);
    expect(saved.volume).toBe(1);
  });

  it('falls back to defaults on corrupt JSON', () => {
    storage.setItem('slimogus.settings.v1', '{not-json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('resolveDisplayName uses custom name or Player N fallback', () => {
    expect(resolveDisplayName(2, { ...DEFAULT_SETTINGS, displayName: 'Cyan' })).toBe('Cyan');
    expect(resolveDisplayName(2, DEFAULT_SETTINGS)).toBe('Player 3');
  });
});
