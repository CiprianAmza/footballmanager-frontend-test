import { of } from 'rxjs';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  afterEach(() => {
    localStorage.removeItem('fm.ui-theme.v1');
    document.documentElement.setAttribute('data-fm-theme', 'classic');
    document.documentElement.style.colorScheme = 'dark';
  });

  it('restores the local theme before remote preferences load', () => {
    localStorage.setItem('fm.ui-theme.v1', 'retro');
    const preferences = jasmine.createSpyObj('TablePreferencesService', ['load', 'save']);

    const service = new ThemeService(preferences);

    expect(service.currentTheme).toBe('retro');
    expect(document.documentElement.getAttribute('data-fm-theme')).toBe('retro');
  });

  it('applies and persists a selected theme', () => {
    const preferences = jasmine.createSpyObj('TablePreferencesService', ['load', 'save']);
    const service = new ThemeService(preferences);

    service.setTheme('disco');

    expect(service.currentTheme).toBe('disco');
    expect(localStorage.getItem('fm.ui-theme.v1')).toBe('disco');
    expect(preferences.save).toHaveBeenCalledWith('appearance.theme', { theme: 'disco' });
  });

  it('accepts Dark as a persisted application theme', () => {
    const preferences = jasmine.createSpyObj('TablePreferencesService', ['load', 'save']);
    const service = new ThemeService(preferences);

    service.setTheme('dark');

    expect(service.currentTheme).toBe('dark');
    expect(document.documentElement.getAttribute('data-fm-theme')).toBe('dark');
    expect(preferences.save).toHaveBeenCalledWith('appearance.theme', { theme: 'dark' });
  });

  it('applies the native light color scheme for Light', () => {
    const preferences = jasmine.createSpyObj('TablePreferencesService', ['load', 'save']);
    const service = new ThemeService(preferences);

    service.setTheme('light');

    expect(service.currentTheme).toBe('light');
    expect(document.documentElement.getAttribute('data-fm-theme')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(preferences.save).toHaveBeenCalledWith('appearance.theme', { theme: 'light' });
  });

  it('accepts the saved per-user preference from the backend', () => {
    const preferences = jasmine.createSpyObj('TablePreferencesService', ['load', 'save']);
    preferences.load.and.returnValue(of({ theme: 'medieval' }));
    const service = new ThemeService(preferences);

    service.loadForCurrentUser();

    expect(service.currentTheme).toBe('medieval');
    expect(document.documentElement.getAttribute('data-fm-theme')).toBe('medieval');
  });

  it('accepts Boho as a persisted application theme', () => {
    const preferences = jasmine.createSpyObj('TablePreferencesService', ['load', 'save']);
    const service = new ThemeService(preferences);

    service.setTheme('boho');

    expect(service.currentTheme).toBe('boho');
    expect(document.documentElement.getAttribute('data-fm-theme')).toBe('boho');
    expect(preferences.save).toHaveBeenCalledWith('appearance.theme', { theme: 'boho' });
  });

  it('accepts Nature as a persisted application theme', () => {
    const preferences = jasmine.createSpyObj('TablePreferencesService', ['load', 'save']);
    const service = new ThemeService(preferences);

    service.setTheme('nature');

    expect(service.currentTheme).toBe('nature');
    expect(document.documentElement.getAttribute('data-fm-theme')).toBe('nature');
    expect(preferences.save).toHaveBeenCalledWith('appearance.theme', { theme: 'nature' });
  });

  it('accepts Ocean as a persisted application theme', () => {
    const preferences = jasmine.createSpyObj('TablePreferencesService', ['load', 'save']);
    const service = new ThemeService(preferences);

    service.setTheme('ocean');

    expect(service.currentTheme).toBe('ocean');
    expect(document.documentElement.getAttribute('data-fm-theme')).toBe('ocean');
    expect(preferences.save).toHaveBeenCalledWith('appearance.theme', { theme: 'ocean' });
  });

  it('accepts Space / Galaxy as a persisted application theme', () => {
    const preferences = jasmine.createSpyObj('TablePreferencesService', ['load', 'save']);
    const service = new ThemeService(preferences);

    service.setTheme('space-galaxy');

    expect(service.currentTheme).toBe('space-galaxy');
    expect(document.documentElement.getAttribute('data-fm-theme')).toBe('space-galaxy');
    expect(preferences.save).toHaveBeenCalledWith('appearance.theme', { theme: 'space-galaxy' });
  });

  it('accepts Halloween as a persisted application theme', () => {
    const preferences = jasmine.createSpyObj('TablePreferencesService', ['load', 'save']);
    const service = new ThemeService(preferences);

    service.setTheme('halloween');

    expect(service.currentTheme).toBe('halloween');
    expect(document.documentElement.getAttribute('data-fm-theme')).toBe('halloween');
    expect(preferences.save).toHaveBeenCalledWith('appearance.theme', { theme: 'halloween' });
  });

  it('accepts Christmas as a persisted application theme', () => {
    const preferences = jasmine.createSpyObj('TablePreferencesService', ['load', 'save']);
    const service = new ThemeService(preferences);

    service.setTheme('christmas');

    expect(service.currentTheme).toBe('christmas');
    expect(document.documentElement.getAttribute('data-fm-theme')).toBe('christmas');
    expect(preferences.save).toHaveBeenCalledWith('appearance.theme', { theme: 'christmas' });
  });

  it('accepts Harry Potter as a persisted application theme', () => {
    const preferences = jasmine.createSpyObj('TablePreferencesService', ['load', 'save']);
    const service = new ThemeService(preferences);

    service.setTheme('harry-potter');

    expect(service.currentTheme).toBe('harry-potter');
    expect(document.documentElement.getAttribute('data-fm-theme')).toBe('harry-potter');
    expect(preferences.save).toHaveBeenCalledWith('appearance.theme', { theme: 'harry-potter' });
  });
});
