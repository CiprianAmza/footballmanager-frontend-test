import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { LeagueMatch } from '../league-competition/league-competition.data';

export interface CalendarEntry {
  day: number;
  title: string;
  round?: number;
  played?: boolean;
  query?: Record<string, string | number | null>;
}

interface MonthCell {
  date: number;
  events: CalendarEntry[];
}

const MONTHS = ['August', 'September', 'October', 'November', 'December', 'January',
  'February', 'March', 'April', 'May', 'June', 'July'];
const MONTH_STARTS = [1, 32, 62, 93, 123, 154, 185, 213, 244, 274, 305, 335, 366];

@Component({
  selector: 'app-competition-calendar',
  templateUrl: './competition-calendar.component.html',
  styleUrls: ['./competition-calendar.component.css']
})
export class CompetitionCalendarComponent implements OnChanges {
  @Input() matches: LeagueMatch[] = [];
  @Input() otherEvents: CalendarEntry[] = [];
  @Input() labels: ReadonlyMap<number, string> = new Map();

  @Input() competitionRoute: (string | number)[] = [];
  @Input() matchQuery: Record<string, string | number | null> = {};
  @Input() resultQuery?: Record<string, string | number | null>;
  readonly months = MONTHS;
  readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  month = 0;
  cells: MonthCell[] = [];
  events: CalendarEntry[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['matches'] && !changes['otherEvents'] && !changes['labels']) return;
    const grouped = new Map<string, { day: number; round: number; count: number; played: boolean }>();
    for (const match of this.matches) {
      const day = match.day || 0;
      if (day < 1 || day > 365) continue;
      const key = day + '/' + match.round;
      const row = grouped.get(key) || { day, round: match.round, count: 0, played: true };
      row.played = row.played && !!match.score;
      row.count++;
      grouped.set(key, row);
    }
    this.events = [...this.otherEvents.filter(row => row.day >= 1 && row.day <= 365),
      ...[...grouped.values()].map(row => ({
        day: row.day, round: row.round, played: row.played,
        title: (this.labels.get(row.round) || 'Round ' + row.round) + ' · ' + row.count + (row.count === 1 ? ' match' : ' matches')
      }))
    ].sort((a, b) => a.day - b.day);
    const next = this.matches.reduce<number | undefined>((day, match) => {
      if (!match.day || match.day < 1 || match.day > 365 || match.score) return day;
      return day === undefined ? match.day : Math.min(day, match.day);
    }, undefined);
    const day = next || this.events[0]?.day || 1;
    const month = MONTH_STARTS.findIndex((start, index) => start <= day && day < MONTH_STARTS[index + 1]);
    this.selectMonth(Math.max(0, month));
  }

  eventQuery(event: CalendarEntry) {
    if (event.query) return event.query;
    return { ...(event.played && this.resultQuery ? this.resultQuery : this.matchQuery), round: event.round };
  }

  selectMonth(month: number): void {
    this.month = month;
    const start = MONTH_STARTS[month];
    const end = MONTH_STARTS[month + 1];
    const pad = start % 7;
    const byDay = new Map<number, CalendarEntry[]>();
    for (const entry of this.events) {
      const day = byDay.get(entry.day) || [];
      day.push(entry);
      byDay.set(entry.day, day);
    }
    this.cells = [
      ...Array.from({ length: pad }, () => ({ date: 0, events: [] })),
      ...Array.from({ length: end - start }, (_, index) => ({ date: index + 1, events: byDay.get(start + index) || [] }))
    ];
  }
}
