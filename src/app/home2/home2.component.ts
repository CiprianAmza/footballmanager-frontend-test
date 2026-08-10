import { Component, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { HomeComponent } from '../home/home.component';
import { TeamService } from '../services/team.service';

interface HomeCommand {
  icon: string;
  label: string;
  description: string;
  route: any[];
  accent: string;
}

interface HomeFocusItem {
  label: string;
  detail: string;
  route: any[];
  tone: 'danger' | 'warning' | 'info' | 'success';
}

@Component({
  selector: 'app-home2',
  templateUrl: './home2.component.html',
  styleUrls: ['./home2.component.css']
})
export class Home2Component extends HomeComponent {
  commandPaletteOpen = false;
  commandQuery = '';

  constructor(http: HttpClient, teamService: TeamService, private router: Router) {
    super(http, teamService);
  }

  get commands(): HomeCommand[] {
    const teamId = this.teamService.teamId;
    const season = this.teamService.currentSeason;
    return [
      { icon: '▦', label: 'Squad', description: 'Selection and player status', route: ['/team', teamId], accent: 'blue' },
      { icon: '⌁', label: 'Tactics', description: 'Formation, roles and instructions', route: ['/tactics', teamId], accent: 'violet' },
      { icon: '✉', label: 'Inbox', description: 'Offers and decisions', route: ['/inbox'], accent: 'amber' },
      { icon: '⇄', label: 'Transfers', description: 'Market and negotiations', route: ['/transfers', teamId, season], accent: 'green' },
      { icon: '⌖', label: 'Scouting', description: 'Search and assignments', route: ['/scouting'], accent: 'cyan' },
      { icon: '↗', label: 'Training', description: 'Weekly development plan', route: ['/training'], accent: 'orange' },
      { icon: '+', label: 'Medical Centre', description: 'Fitness and injuries', route: ['/medical'], accent: 'red' },
      { icon: '◫', label: 'Data Hub', description: 'Performance analysis', route: ['/data-hub'], accent: 'pink' },
      { icon: '◷', label: 'Schedule', description: 'Fixtures and results', route: ['/fixtures', teamId], accent: 'slate' },
      { icon: '€', label: 'Finances', description: 'Budgets and club balance', route: ['/finances'], accent: 'lime' }
    ];
  }

  get filteredCommands(): HomeCommand[] {
    const query = this.commandQuery.trim().toLowerCase();
    if (!query) return this.commands;
    return this.commands.filter(command =>
      command.label.toLowerCase().includes(query)
      || command.description.toLowerCase().includes(query));
  }

  get focusItems(): HomeFocusItem[] {
    const items: HomeFocusItem[] = [];
    if (this.managerFired) {
      items.push({ label: 'Find a new club', detail: 'The board ended your contract.', route: ['/job-search'], tone: 'danger' });
    }
    const activeRequests = this.boardRequests.filter(request => request.status === 'ACTIVE');
    if (activeRequests.length) {
      items.push({
        label: `${activeRequests.length} board request${activeRequests.length === 1 ? '' : 's'}`,
        detail: activeRequests[0].description || 'Review the board requirements.',
        route: ['/home'],
        tone: 'warning'
      });
    }
    if (this.boardConfidence < 40) {
      items.push({ label: 'Board confidence is low', detail: `${this.boardConfidence}% confidence`, route: ['/finances'], tone: 'danger' });
    }
    if (this.debt > 0) {
      items.push({ label: 'Club debt requires attention', detail: this.formatCompactMoney(this.debt), route: ['/finances'], tone: 'warning' });
    }
    if (this.teamService.transferWindowOpen) {
      items.push({
        label: 'Transfer window is open',
        detail: `${this.formatCompactMoney(this.transferBudget)} available`,
        route: ['/transfers', this.teamService.teamId, this.teamService.currentSeason],
        tone: 'success'
      });
    }
    if (items.length === 0 && this.matchPreview) {
      items.push({
        label: 'Prepare the next match',
        detail: `Review the plan for ${this.opponentName}.`,
        route: ['/tactics', this.teamService.teamId],
        tone: 'info'
      });
    }
    return items.slice(0, 4);
  }

  get opponentName(): string {
    if (!this.matchPreview) return this.nextMatch?.opponentTeam || 'the next opponent';
    return Number(this.matchPreview.homeTeamId) === Number(this.teamService.teamId)
      ? this.matchPreview.awayTeamName : this.matchPreview.homeTeamName;
  }

  get powerHomeShare(): number {
    const home = Number(this.matchPreview?.homePowerRating || 0);
    const away = Number(this.matchPreview?.awayPowerRating || 0);
    return home + away > 0 ? Math.round(home / (home + away) * 100) : 50;
  }

  get activeObjectives(): any[] {
    return this.seasonObjectives.filter(objective => objective.status === 'active').slice(0, 3);
  }

  get activeBoardRequests(): any[] {
    return this.boardRequests.filter(request => request.status === 'ACTIVE').slice(0, 3);
  }

  get displayedTable(): any[] {
    if (this.leagueTable.length <= 7) return this.leagueTable;
    const teamIndex = this.leagueTable.findIndex(row => row.isHumanTeam || row.name === this.teamName || row.teamName === this.teamName);
    if (teamIndex < 0) return this.leagueTable.slice(0, 7);
    const start = Math.max(0, Math.min(teamIndex - 3, this.leagueTable.length - 7));
    return this.leagueTable.slice(start, start + 7);
  }

  formatCompactMoney(value: number): string {
    const absolute = Math.abs(Number(value) || 0);
    if (absolute >= 1_000_000_000) return `€${(value / 1_000_000_000).toFixed(1)}B`;
    if (absolute >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
    if (absolute >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
    return `€${value || 0}`;
  }

  openCommandPalette(): void {
    this.commandQuery = '';
    this.commandPaletteOpen = true;
  }

  closeCommandPalette(): void {
    this.commandPaletteOpen = false;
  }

  runCommand(command: HomeCommand): void {
    this.commandPaletteOpen = false;
    this.router.navigate(command.route);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    if (event.key === 'Escape' && this.commandPaletteOpen) {
      this.closeCommandPalette();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.commandPaletteOpen ? this.closeCommandPalette() : this.openCommandPalette();
      return;
    }
    if (!isTyping && event.key === '/') {
      event.preventDefault();
      this.openCommandPalette();
    }
  }
}
