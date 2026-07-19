/** Curated Quaternius Ultimate Animated Character Pack roster (CC0). */

export interface CharacterDef {
  readonly id: string;
  readonly label: string;
  readonly url: string;
}

export const CHARACTER_ROSTER: readonly CharacterDef[] = [
  { id: 'suit', label: 'Suit', url: 'assets/characters/suit.glb' },
  { id: 'worker', label: 'Worker', url: 'assets/characters/worker.glb' },
  { id: 'doctor', label: 'Doctor', url: 'assets/characters/doctor.glb' },
  { id: 'casual', label: 'Casual', url: 'assets/characters/casual.glb' },
  { id: 'ninja', label: 'Ninja', url: 'assets/characters/ninja.glb' },
  { id: 'cowboy', label: 'Cowboy', url: 'assets/characters/cowboy.glb' },
  { id: 'knight', label: 'Knight', url: 'assets/characters/knight.glb' },
  { id: 'elf', label: 'Elf', url: 'assets/characters/elf.glb' },
  { id: 'witch', label: 'Witch', url: 'assets/characters/witch.glb' },
  { id: 'goblin', label: 'Goblin', url: 'assets/characters/goblin.glb' },
  { id: 'soldier', label: 'Soldier', url: 'assets/characters/soldier.glb' },
  { id: 'pirate', label: 'Pirate', url: 'assets/characters/pirate.glb' },
] as const;

export const DEFAULT_CHARACTER_ID = CHARACTER_ROSTER[0]!.id;

export function getCharacterDef(characterId: string | undefined | null): CharacterDef {
  const found = CHARACTER_ROSTER.find((c) => c.id === characterId);
  return found ?? CHARACTER_ROSTER[0]!;
}

export function getCharacterLabel(characterId: string | undefined | null): string {
  return getCharacterDef(characterId).label;
}
