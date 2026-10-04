import { describe, expect, it } from 'vitest';
import { AVATAR_IDS, AVATARS, POSES, composeAvatar, composePose, isAvatarId } from './parts.ts';

describe('mascot parts', () => {
  it('composes every required pose', () => {
    expect(POSES).toEqual(['idle', 'happy', 'thinking', 'celebrating', 'sleepy']);
    for (const pose of POSES) {
      const svg = composePose(pose);
      expect(svg).toContain('m-headgroup');
      expect(svg).toContain('m-tail');
    }
  });

  it('has at least 8 avatars, each with a Polish label and a distinct look', () => {
    expect(AVATAR_IDS.length).toBeGreaterThanOrEqual(8);
    const markups = new Set(AVATAR_IDS.map((id) => composeAvatar(id)));
    expect(markups.size).toBe(AVATAR_IDS.length);
    for (const id of AVATAR_IDS) expect(AVATARS[id].label.length).toBeGreaterThan(0);
  });

  it('stays small', () => {
    for (const pose of POSES) expect(composePose(pose).length).toBeLessThan(6000);
  });

  it('validates avatar ids', () => {
    expect(isAvatarId('scarf')).toBe(true);
    expect(isAvatarId('shifu')).toBe(false);
    expect(isAvatarId(3)).toBe(false);
  });
});
