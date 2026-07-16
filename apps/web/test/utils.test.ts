import { describe, expect, it } from 'vitest';
import { displayName, featureIdentity } from '../src/lib/utils';
import { usePreferencesStore } from '../src/stores/preferences-store';

describe('web foundations', () => {
  it('selects a useful localized place name', () => {
    expect(displayName({ name: '同济大学图书馆', 'name:en': 'Tongji Library' })).toBe('同济大学图书馆');
    expect(displayName({ ref: 'A-101' })).toBe('A-101');
    expect(displayName({})).toBe('未命名地点');
  });

  it('uses the shared stable ID before source-specific IDs', () => {
    expect(featureIdentity({ stable_id: 'tongji-siping-way-42', id: 'way/42' }, 42)).toBe('tongji-siping-way-42');
    expect(featureIdentity({ id: 'way/42' }, 42)).toBe('way/42');
  });

  it('switches map themes without persistent browser storage', () => {
    const initial = usePreferencesStore.getState().theme;
    usePreferencesStore.getState().toggleTheme();
    expect(usePreferencesStore.getState().theme).not.toBe(initial);
    usePreferencesStore.getState().setTheme(initial);
  });
});
