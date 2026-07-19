import { DEFAULT_CHARACTER_ID, getCharacterDef } from '@render/characterRoster';

const STORAGE_KEY = 'slimogus.settings.v1';

export interface Settings {
  displayName: string;
  muted: boolean;
  /** Master volume in [0, 1]. */
  volume: number;
  /** When false, the help overlay auto-shows once at first game start. */
  seenTutorial: boolean;
  /** Selected Quaternius character roster id. */
  characterId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  muted: false,
  volume: 0.7,
  seenTutorial: false,
  characterId: DEFAULT_CHARACTER_ID,
};

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.volume;
  return Math.min(1, Math.max(0, value));
}

function sanitizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 24);
}

function sanitizeCharacterId(value: unknown): string {
  if (typeof value !== 'string' || !value) return DEFAULT_CHARACTER_ID;
  return getCharacterDef(value).id;
}

function normalize(partial: Partial<Settings> | null | undefined): Settings {
  return {
    displayName: sanitizeDisplayName(partial?.displayName),
    muted: Boolean(partial?.muted),
    volume: clampVolume(
      typeof partial?.volume === 'number' ? partial.volume : DEFAULT_SETTINGS.volume,
    ),
    seenTutorial: Boolean(partial?.seenTutorial),
    characterId: sanitizeCharacterId(partial?.characterId),
  };
}

/** Loads persisted settings from `localStorage`, falling back to defaults on missing/corrupt data. */
export function loadSettings(storage: Storage = localStorage): Settings {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalize(JSON.parse(raw) as Partial<Settings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Merges `patch` into the current settings, persists, and returns the new snapshot. */
export function saveSettings(patch: Partial<Settings>, storage: Storage = localStorage): Settings {
  const next = normalize({ ...loadSettings(storage), ...patch });
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — still return the in-memory merge so the session keeps working.
  }
  return next;
}

/** Display name for lobby join: trimmed custom name, or the deterministic `Player N` fallback. */
export function resolveDisplayName(playerId: number, settings: Settings = loadSettings()): string {
  return settings.displayName || `Player ${playerId + 1}`;
}
