import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { urlApp } from '../app.component';

export type GlobalSearchKind = 'COMMAND' | 'PLAYER' | 'CLUB' | 'COMPETITION' | 'PAGE';
export type GlobalPaletteAction = 'CONTINUE' | 'SAVE_GAME' | 'LOAD_GAME';

export interface GlobalSearchItem {
  kind: GlobalSearchKind;
  id: string | number;
  name: string;
  meta: string;
  route: string;
  icon: string;
  shortcut?: string[];
  action?: GlobalPaletteAction;
}

export interface GlobalSearchResults {
  pages: GlobalSearchItem[];
  players: GlobalSearchItem[];
  clubs: GlobalSearchItem[];
  competitions: GlobalSearchItem[];
  commands: GlobalSearchItem[];
}

interface ApiSearchItem { id: number; name: string; meta: string; }
interface ApiSearchResponse {
  players?: ApiSearchItem[];
  clubs?: ApiSearchItem[];
  competitions?: ApiSearchItem[];
}

interface PageDefinition {
  name: string;
  meta: string;
  route: string;
  icon: string;
  keywords: string;
  shortcut?: string[];
}

interface CommandDefinition {
  name: string;
  meta: string;
  icon: string;
  keywords: string;
  shortcut: string[];
  action: GlobalPaletteAction;
}

const COMMAND_CATALOG: CommandDefinition[] = [
  { name: 'Continue game', meta: 'Advance to the next event', icon: 'play', keywords: 'advance next day match', shortcut: ['Space'], action: 'CONTINUE' },
  { name: 'Save game', meta: 'Download the current career', icon: 'save', keywords: 'export career download', shortcut: ['MOD', 'S'], action: 'SAVE_GAME' },
  { name: 'Load game', meta: 'Restore a career from a file', icon: 'upload', keywords: 'import restore career', shortcut: ['MOD', 'O'], action: 'LOAD_GAME' }
];

const PAGE_CATALOG: PageDefinition[] = [
  { name: 'Home', meta: 'Manager dashboard', route: '/home', icon: 'building', keywords: 'dashboard desk start', shortcut: ['G', 'H'] },
  { name: 'Inbox', meta: 'Messages and decisions', route: '/inbox', icon: 'bell', keywords: 'notifications messages email', shortcut: ['G', 'I'] },
  { name: 'Social Feed', meta: 'Supporter reactions and club talk', route: '/social-feed', icon: 'users', keywords: 'fans supporters reddit reactions social', shortcut: ['G', 'V'] },
  { name: 'Squad', meta: 'Players and availability', route: '/squad', icon: 'users', keywords: 'team lineup players', shortcut: ['G', 'S'] },
  { name: 'Tactics', meta: 'Formation and instructions', route: '/tactics', icon: 'chart', keywords: 'formation strategy instructions', shortcut: ['G', 'T'] },
  { name: 'Schedule', meta: 'Fixtures and calendar', route: '/fixtures', icon: 'calendar', keywords: 'matches calendar results', shortcut: ['G', 'M'] },
  { name: 'Transfers', meta: 'Recruitment centre', route: '/transfers', icon: 'more', keywords: 'market offers loans recruitment', shortcut: ['G', 'R'] },
  { name: 'Scouting', meta: 'Player discovery', route: '/scouting', icon: 'search', keywords: 'recruitment scout players', shortcut: ['G', 'F'] },
  { name: 'Training', meta: 'Training schedules', route: '/training', icon: 'chart', keywords: 'development practice', shortcut: ['G', 'N'] },
  { name: 'Medical Centre', meta: 'Injuries and recovery', route: '/medical', icon: 'alert', keywords: 'injury health recovery', shortcut: ['G', 'D'] },
  { name: 'Staff', meta: 'Club personnel', route: '/staff', icon: 'users', keywords: 'coaches employees personnel', shortcut: ['G', 'A'] },
  { name: 'Youth Academy', meta: 'Academy and facilities', route: '/youth-academy', icon: 'building', keywords: 'youth prospects junior', shortcut: ['G', 'Y'] },
  { name: 'Data Hub', meta: 'Performance intelligence', route: '/data-hub', icon: 'chart', keywords: 'analytics stats statistics', shortcut: ['G', 'U'] },
  { name: 'Finances', meta: 'Club finances', route: '/finances', icon: 'chart', keywords: 'money budget debt', shortcut: ['G', 'E'] },
  { name: 'Stadium', meta: 'Stadium and facilities', route: '/stadium', icon: 'stadium', keywords: 'facilities ground capacity', shortcut: ['G', 'G'] },
  { name: 'Competitions', meta: 'Competition browser', route: '/competition-list', icon: 'trophy', keywords: 'leagues cups world', shortcut: ['G', 'P'] },
  { name: 'Coefficients', meta: 'International coefficients', route: '/coefficients', icon: 'trophy', keywords: 'europe rankings', shortcut: ['G', 'O'] },
  { name: 'Friendlies', meta: 'Friendly matches', route: '/friendlies', icon: 'ball', keywords: 'tour tournament match', shortcut: ['G', 'L'] },
  { name: 'Job Search', meta: 'Manager opportunities', route: '/job-search', icon: 'search', keywords: 'jobs manager career', shortcut: ['G', 'J'] }
];

@Injectable({ providedIn: 'root' })
export class GlobalSearchService {
  constructor(private http: HttpClient) {}

  quickCommands(): GlobalSearchItem[] {
    return COMMAND_CATALOG.map((command, index) => this.commandItem(command, index));
  }

  quickPages(actingTeamId = 0, currentSeason = 1): GlobalSearchItem[] {
    return PAGE_CATALOG.slice(0, 6)
      .map((page, index) => this.pageItem(page, index, actingTeamId, currentSeason));
  }

  search(rawQuery: string, actingTeamId: number, currentSeason: number): Observable<GlobalSearchResults> {
    const query = rawQuery.trim().toLowerCase();
    const commands = COMMAND_CATALOG
      .filter(command => `${command.name} ${command.meta} ${command.keywords}`.toLowerCase().includes(query))
      .map((command, index) => this.commandItem(command, index));
    const pages = PAGE_CATALOG
      .filter(page => `${page.name} ${page.meta} ${page.keywords}`.toLowerCase().includes(query))
      .slice(0, 6)
      .map((page, index) => this.pageItem(page, index, actingTeamId, currentSeason));

    if (query.length < 2) return of({ commands, pages, players: [], clubs: [], competitions: [] });

    return this.http.get<ApiSearchResponse>(`${urlApp}/api/search`, {
      params: { q: rawQuery.trim(), limit: 6 }
    }).pipe(
      map(response => ({
        commands,
        pages,
        players: (response.players || []).map(item => ({
          kind: 'PLAYER' as const,
          id: item.id,
          name: item.name,
          meta: item.meta,
          route: `/player/${item.id}${actingTeamId ? `?actingTeamId=${actingTeamId}` : ''}`,
          icon: 'user'
        })),
        clubs: (response.clubs || []).map(item => ({
          kind: 'CLUB' as const,
          id: item.id,
          name: item.name,
          meta: item.meta,
          route: `/team/${item.id}`,
          icon: 'building'
        })),
        competitions: (response.competitions || []).map(item => ({
          kind: 'COMPETITION' as const,
          id: item.id,
          name: item.name,
          meta: item.meta,
          route: `/competition/${item.id}`,
          icon: 'trophy'
        }))
      })),
      catchError(() => of({ commands, pages, players: [], clubs: [], competitions: [] }))
    );
  }

  findNavigationShortcut(key: string, actingTeamId: number, currentSeason: number): GlobalSearchItem | undefined {
    const normalized = key.trim().toUpperCase();
    const index = PAGE_CATALOG.findIndex(page => page.shortcut?.[0] === 'G' && page.shortcut?.[1] === normalized);
    return index < 0 ? undefined : this.pageItem(PAGE_CATALOG[index], index, actingTeamId, currentSeason);
  }

  private pageItem(page: PageDefinition, index: number, teamId = 0, season = 1): GlobalSearchItem {
    let route = page.route;
    if (teamId && route === '/fixtures') route = `/fixtures/${teamId}`;
    if (teamId && route === '/transfers') route = `/transfers/${teamId}/${season}`;
    if (teamId && route === '/tactics') route = `/tactics/${teamId}`;
    return {
      kind: 'PAGE', id: `${page.route}-${index}`, name: page.name, meta: page.meta,
      route, icon: page.icon, shortcut: page.shortcut
    };
  }

  private commandItem(command: CommandDefinition, index: number): GlobalSearchItem {
    return {
      kind: 'COMMAND', id: `command-${index}`, name: command.name, meta: command.meta,
      route: '', icon: command.icon, shortcut: command.shortcut, action: command.action
    };
  }
}
