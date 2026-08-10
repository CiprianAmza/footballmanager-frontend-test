import { Component, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { AppTheme, ThemeDefinition, ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnDestroy {
  readonly themes: readonly ThemeDefinition[];
  selectedTheme: AppTheme;
  savedMessage = '';
  private readonly themeSubscription: Subscription;
  private messageTimer?: ReturnType<typeof setTimeout>;

  constructor(public themeService: ThemeService) {
    this.themes = themeService.themes;
    this.selectedTheme = themeService.currentTheme;
    this.themeSubscription = themeService.theme$.subscribe(theme => this.selectedTheme = theme);
  }

  get selectedThemeName(): string {
    return this.themes.find(theme => theme.id === this.selectedTheme)?.name || this.selectedTheme;
  }

  chooseTheme(theme: AppTheme): void {
    if (theme === this.selectedTheme) return;
    this.themeService.setTheme(theme);
    const definition = this.themes.find(item => item.id === theme);
    this.savedMessage = `${definition?.name || 'Theme'} applied and saved.`;
    if (this.messageTimer) clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => this.savedMessage = '', 2800);
  }

  resetTheme(): void {
    this.themeService.reset();
    this.savedMessage = 'Classic theme restored.';
  }

  trackTheme(_: number, theme: ThemeDefinition): AppTheme {
    return theme.id;
  }

  ngOnDestroy(): void {
    this.themeSubscription.unsubscribe();
    if (this.messageTimer) clearTimeout(this.messageTimer);
  }
}
