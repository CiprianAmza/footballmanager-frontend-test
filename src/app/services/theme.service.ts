import { Injectable } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';

import { TablePreferencesService } from '../shared/table-preferences.service';

export type AppTheme = 'classic' | 'dark' | 'light' | 'retro' | 'medieval' | 'matrix' | 'disco' | 'boho' | 'nature' | 'ocean' | 'space-galaxy' | 'halloween' | 'christmas' | 'harry-potter';

export interface ThemeDefinition {
  id: AppTheme;
  name: string;
  era: string;
  description: string;
  glyph: string;
  colors: readonly string[];
}

interface AppearancePreference {
  theme: AppTheme;
}

const THEME_IDS: readonly AppTheme[] = ['classic', 'dark', 'light', 'retro', 'medieval', 'matrix', 'disco', 'boho', 'nature', 'ocean', 'space-galaxy', 'halloween', 'christmas', 'harry-potter'];
const LOCAL_THEME_KEY = 'fm.ui-theme.v1';
const REMOTE_PREFERENCE_KEY = 'appearance.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly themes: readonly ThemeDefinition[] = [
    {
      id: 'classic', name: 'Classic', era: 'Modern touchline', glyph: 'FM',
      description: 'The familiar dark Football Manager workspace: restrained, clear and data-first.',
      colors: ['#1a1d2e', '#232639', '#f1c40f', '#3498db']
    },
    {
      id: 'dark', name: 'Dark', era: 'After-hours analysis', glyph: '◐',
      description: 'True charcoal surfaces, crisp neutral type and cool blue focus with minimal visual noise.',
      colors: ['#090b0f', '#151922', '#58a6ff', '#aab4c2']
    },
    {
      id: 'light', name: 'Light', era: 'Daylight analysis', glyph: '○',
      description: 'Warm white workspaces, navy typography and clean blue focus for bright environments.',
      colors: ['#f6f8fb', '#ffffff', '#1f6feb', '#182230']
    },
    {
      id: 'retro', name: 'Retro', era: '1990s computer room', glyph: '96',
      description: 'Sharp pixels, navy terminals, cyan highlights and unapologetic old-school panels.',
      colors: ['#080b28', '#17164a', '#00d7ff', '#ff4fd8']
    },
    {
      id: 'medieval', name: 'Medieval', era: 'The royal dugout', glyph: '♜',
      description: 'Parchment, oak, brass and heraldic red for the manager who rules rather than coaches.',
      colors: ['#21170f', '#4a3420', '#d7b45a', '#8f2f2b']
    },
    {
      id: 'matrix', name: 'Matrix', era: 'Football mainframe', glyph: '01',
      description: 'A black-and-green tactical terminal with scanlines and high-contrast live data.',
      colors: ['#020604', '#07130b', '#32ff72', '#0ca83e']
    },
    {
      id: 'disco', name: 'Disco', era: 'Saturday night dugout', glyph: '✦',
      description: 'Mirror-ball gradients, glossy panels and electric pink and cyan for a lively match night.',
      colors: ['#10051f', '#30124d', '#ff4fd8', '#42e8ff']
    },
    {
      id: 'boho', name: 'Boho', era: 'Free-spirited touchline', glyph: '☼',
      description: 'Terracotta, sand and sage meet soft organic shapes and understated woven textures.',
      colors: ['#221b17', '#49372c', '#d98962', '#9db68c']
    },
    {
      id: 'nature', name: 'Nature', era: 'Forest touchline', glyph: '❧',
      description: 'Deep forest, moss, bark and mist create a calm organic workspace built for long seasons.',
      colors: ['#0e1a14', '#294332', '#8fbd73', '#b4c7b5']
    },
    {
      id: 'ocean', name: 'Ocean', era: 'Deep-sea command deck', glyph: '≋',
      description: 'Abyssal navy, teal currents, aqua highlights and sea-foam type keep every screen cool and clear.',
      colors: ['#061827', '#12364a', '#20c6c7', '#bdeff1']
    },
    {
      id: 'space-galaxy', name: 'Space / Galaxy', era: 'Orbital analytics deck', glyph: '◎',
      description: 'Cosmic black, indigo nebulae, violet focus and cyan starlight for an expansive football universe.',
      colors: ['#050714', '#17132f', '#9a6cff', '#43d9ff']
    },
    {
      id: 'halloween', name: 'Halloween', era: 'Midnight matchday', glyph: '☽',
      description: 'Charcoal black, pumpkin orange, spectral green and purple fog turn every fixture into a night game.',
      colors: ['#0c090f', '#34203a', '#ff8a2a', '#8fd14f']
    },
    {
      id: 'christmas', name: 'Christmas', era: 'Festive fixture list', glyph: '✶',
      description: 'Evergreen panels, burgundy red, candlelit gold and soft snow brighten the winter schedule.',
      colors: ['#0b1712', '#274737', '#e0525c', '#d9b45f']
    },
    {
      id: 'harry-potter', name: 'Harry Potter', era: 'Enchanted castle dugout', glyph: '✧',
      description: 'Midnight halls, burgundy velvet, parchment and candlelit gold for a magical football world.',
      colors: ['#0b1020', '#302641', '#7a263a', '#d6b56c']
    }
  ];

  private readonly themeSubject: BehaviorSubject<AppTheme>;
  readonly theme$;
  private remoteLoad?: Subscription;

  constructor(private preferences: TablePreferencesService) {
    const initial = this.readLocalTheme();
    this.themeSubject = new BehaviorSubject<AppTheme>(initial);
    this.theme$ = this.themeSubject.asObservable();
    this.applyToDocument(initial);
  }

  get currentTheme(): AppTheme {
    return this.themeSubject.value;
  }

  loadForCurrentUser(): void {
    this.remoteLoad?.unsubscribe();
    this.remoteLoad = this.preferences.load<AppearancePreference>(
      REMOTE_PREFERENCE_KEY,
      { theme: this.currentTheme }
    ).subscribe(preference => this.applyTheme(preference.theme, true));
  }

  setTheme(theme: AppTheme): void {
    const next = this.normalize(theme);
    this.applyTheme(next, true);
    this.preferences.save<AppearancePreference>(REMOTE_PREFERENCE_KEY, { theme: next });
  }

  reset(): void {
    this.setTheme('classic');
  }

  private applyTheme(theme: AppTheme, persistLocally: boolean): void {
    const next = this.normalize(theme);
    this.applyToDocument(next);
    if (this.themeSubject.value !== next) this.themeSubject.next(next);
    if (persistLocally) {
      try { localStorage.setItem(LOCAL_THEME_KEY, next); } catch { /* Storage can be unavailable. */ }
    }
  }

  private applyToDocument(theme: AppTheme): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-fm-theme', theme);
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  }

  private readLocalTheme(): AppTheme {
    try { return this.normalize(localStorage.getItem(LOCAL_THEME_KEY)); }
    catch { return 'classic'; }
  }

  private normalize(theme: string | null | undefined): AppTheme {
    return THEME_IDS.includes(theme as AppTheme) ? theme as AppTheme : 'classic';
  }
}
