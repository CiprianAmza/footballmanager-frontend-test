import {
  DEFAULT_FILTERS, ScheduleView, buildCalendarMonth, buildRow, buildRows, competitionOptions, defaultSelection,
  filterRows, firstWeekdays, formBefore, groupByMonth, hasActiveFilters, hasPanelFilters, ordinalPosition,
  relativeDay, resultNote, sortRows, summarise
} from './schedule-model';

const TEAM = 86;

function view(overrides: Partial<ScheduleView> = {}): ScheduleView {
  return {
    opponentTeam: 'Rival', homeOrAway: 'H', competitionName: 'Liga 1', score: '-', date: '5 September', day: 40,
    competitionId: 1, seasonNumber: 15, roundNumber: 3, teamId1: TEAM, teamId2: 12,
    ...overrides
  };
}

describe('schedule-model', () => {
  describe('buildRow', () => {
    it('uses the explicit contract fields for a played home match', () => {
      const row = buildRow(view({
        score: '2 - 1', status: 'played', resultOutcome: 'W', teamGoals: 2, opponentGoals: 1,
        opponentTeamId: 12, roundLabel: 'Matchday 3', competitionType: 'League', reportAvailable: true,
        venueName: 'Arena', dayOfWeek: 'Tuesday'
      }), TEAM);

      expect(row.played).toBeTrue();
      expect(row.outcome).toBe('W');
      expect([row.homeGoals, row.awayGoals]).toEqual([2, 1]);
      expect(row.opponentId).toBe(12);
      expect(row.stageLabel).toBe('Matchday 3');
      expect(row.competitionLabel).toBe('Liga 1');
      expect(row.competitionKind).toBe('league');
      expect(row.competitionLink).toBe(1);
      expect(row.venueName).toBe('Arena');
      expect(row.monthLabel).toBe('September');
      expect(row.dayOfMonth).toBe(5);
      expect(row.weekday).toBe(1);
      expect(row.dateLabel).toBe('Tue 5 Sep');
      expect(row.longDateLabel).toBe('Tuesday 5 September');
      expect(row.reportLink).toEqual(['/match-report2', 1, 15, 3, TEAM, 12]);
    });

    it('falls back to the legacy fields for an away match', () => {
      const row = buildRow(view({
        homeOrAway: 'A', teamId1: 12, teamId2: TEAM, score: '0 - 3', winnerTeamId: 12
      }), TEAM);

      expect(row.venue).toBe('A');
      expect(row.opponentId).toBe(12);
      expect(row.played).toBeTrue();
      expect(row.outcome).toBe('L');
      expect([row.teamGoals, row.opponentGoals]).toEqual([0, 3]);
      expect([row.homeGoals, row.awayGoals]).toEqual([3, 0]);
      expect(row.stageLabel).toBe('Matchday 3');
      expect(row.dateLabel).toBe('5 Sep');
    });

    it('derives the weekday from the game-date anchor of the same season only', () => {
      const anchor = { season: 15, day: 1, dayOfWeek: 'Tuesday' };
      expect(buildRow(view({ day: 7, date: '7 August' }), TEAM, null, 0, anchor).dateLabel).toBe('Mon 7 Aug');
      expect(buildRow(view({ day: 7, date: '7 August', seasonNumber: 14 }), TEAM, null, 0, anchor).weekday).toBeNull();
    });

    it('treats unplayed matches as fixtures without a report', () => {
      const row = buildRow(view({ status: 'upcoming', reportAvailable: false, opponentLeaguePosition: 2 }), TEAM);

      expect(row.played).toBeFalse();
      expect(row.outcome).toBeNull();
      expect(row.homeGoals).toBeNull();
      expect(row.reportLink).toBeNull();
      expect(row.opponentPosition).toBe(2);
    });

    it('labels cups with their stage and friendlies as Friendly, without competition links for friendlies', () => {
      const cup = buildRow(view({ competitionId: 5, competitionName: 'Cupa', competitionType: 'Cup', roundLabel: 'Quarter-Final' }), TEAM);
      const friendly = buildRow(view({
        competitionId: -4, competitionName: 'Summer Cup · SEMI_FINAL', score: '1 - 1', status: 'played',
        reportAvailable: false, competitionType: 'Friendly'
      }), TEAM);

      expect(cup.competitionLabel).toBe('Cupa Quarter-Final');
      expect(friendly.competitionKind).toBe('friendly');
      expect(friendly.competitionLabel).toBe('Friendly');
      expect(friendly.competitionLink).toBeNull();
      expect(friendly.reportLink).toBeNull();
      expect(friendly.stageLabel).toBe('Semi final');
      expect(friendly.outcome).toBe('D');
    });

    it('marks extra time with the FM "e" prefix instead of a note', () => {
      const row = buildRow(view({ score: '0 - 0 (a.e.t.)', status: 'played', resultOutcome: 'W', decidedBy: 'EXTRA_TIME' }), TEAM);

      expect(row.extraTime).toBeTrue();
      expect(row.resultNote).toBeNull();
    });

    it('marks matches without a recorded calendar day', () => {
      const row = buildRow(view({ day: 0, date: 'Matchday 3', unknownFields: ['day', 'date', 'dayOfWeek'] }), TEAM);

      expect(row.dateKnown).toBeFalse();
      expect(row.day).toBeNull();
      expect(row.weekday).toBeNull();
      expect(row.dateLabel).toBe('—');
      expect(row.monthLabel).toBe('Date not recorded');
    });

    it('classifies continental and cup competitions', () => {
      expect(buildRow(view({ competitionType: 'Continental' }), TEAM).competitionKind).toBe('continental');
      expect(buildRow(view({ competitionType: 'Cup' }), TEAM).competitionKind).toBe('cup');
    });
  });

  describe('resultNote', () => {
    it('reports aggregate and penalties from the viewed club side', () => {
      const away = view({
        homeOrAway: 'A', teamId1: 12, teamId2: TEAM,
        aggregateTeam1Score: 3, aggregateTeam2Score: 3, penaltyTeam1Score: 2, penaltyTeam2Score: 4
      });

      expect(resultNote(away, 'A')).toBe('agg 3-3, 4-2 pens');
    });

    it('describes legs and keeps extra time out of the note', () => {
      expect(resultNote(view({ legNumber: 1, decidedBy: 'FIRST_LEG' }), 'H')).toBe('1st leg');
      expect(resultNote(view({ legNumber: 2 }), 'H')).toBe('2nd leg');
      expect(resultNote(view({ decidedBy: 'EXTRA_TIME' }), 'H')).toBeNull();
      expect(resultNote(view({ score: '1 - 1 (agg 3-3, pens 4-3)' }), 'H')).toBe('agg 3-3, pens 4-3');
      expect(resultNote(view({ legNumber: 0, decidedBy: 'NORMAL' }), 'H')).toBeNull();
    });
  });

  describe('lists', () => {
    const rows = buildRows([
      view({ roundNumber: 1, day: 10, date: '20 August', score: '1 - 0', status: 'played', teamId2: 11, opponentTeam: 'Alpha' }),
      view({ roundNumber: 2, day: 17, date: '27 August', score: '0 - 2', status: 'played', homeOrAway: 'A', teamId1: 13, teamId2: TEAM, opponentTeam: 'Delta' }),
      view({ roundNumber: 7, day: 20, date: '30 August', competitionId: -2, competitionName: 'Friendly', score: '5 - 0', status: 'played', teamId2: 14, opponentTeam: 'Charlie' }),
      view({ roundNumber: 1, day: 54, date: '3 October', competitionId: 5, competitionName: 'Cupa', competitionType: 'Cup', score: '1 - 1', status: 'played', teamId2: 15, opponentTeam: 'Bravo' }),
      view({ roundNumber: 3, day: 61, date: '10 October', status: 'upcoming', opponentTeam: 'Next FC', teamId2: 16 })
    ], TEAM);

    it('keeps the backend order and groups months, optionally showing empty months', () => {
      expect(rows.map(r => r.order)).toEqual([0, 1, 2, 3, 4]);
      expect(groupByMonth(rows).map(g => [g.label, g.rows.length])).toEqual([['August', 3], ['October', 2]]);
      expect(groupByMonth(rows, true).map(g => [g.label, g.rows.length])).toEqual([['August', 3], ['September', 0], ['October', 2]]);
    });

    it('filters by show, competitions, venues, result and search', () => {
      expect(filterRows(rows, { ...DEFAULT_FILTERS, show: 'fixtures' }).length).toBe(1);
      expect(filterRows(rows, { ...DEFAULT_FILTERS, show: 'results' }).length).toBe(4);
      expect(filterRows(rows, { ...DEFAULT_FILTERS, competitions: ['c5'] }).map(r => r.competitionId)).toEqual([5]);
      expect(filterRows(rows, { ...DEFAULT_FILTERS, competitions: ['c5', 'friendly'] }).length).toBe(2);
      expect(filterRows(rows, { ...DEFAULT_FILTERS, venues: ['A'] }).length).toBe(1);
      expect(filterRows(rows, { ...DEFAULT_FILTERS, result: 'L' }).length).toBe(1);
      expect(filterRows(rows, { ...DEFAULT_FILTERS, search: 'next' }).length).toBe(1);
      expect(hasActiveFilters(DEFAULT_FILTERS)).toBeFalse();
      expect(hasPanelFilters({ ...DEFAULT_FILTERS, venues: ['H'] })).toBeTrue();
      expect(hasPanelFilters({ ...DEFAULT_FILTERS, search: 'x' })).toBeFalse();
      expect(hasActiveFilters({ ...DEFAULT_FILTERS, search: 'x' })).toBeTrue();
    });

    it('lists competitions league first, friendlies last', () => {
      expect(competitionOptions(rows).map(o => [o.key, o.count])).toEqual([['c1', 3], ['c5', 1], ['friendly', 1]]);
    });

    it('sorts by column, keeping the backend order for ties', () => {
      expect(sortRows(rows, 'opposition').map(r => r.opponentName)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Next FC']);
      expect(sortRows(rows, 'result', true).map(r => r.opponentName)).toEqual(['Charlie', 'Alpha', 'Bravo', 'Delta', 'Next FC']);
      expect(sortRows(rows, 'date', true).map(r => r.order)).toEqual([4, 3, 2, 1, 0]);
    });

    it('summarises the visible matches', () => {
      expect(summarise(rows)).toEqual({
        played: 4, upcoming: 1, wins: 2, draws: 1, losses: 1, goalsFor: 7, goalsAgainst: 3, form: ['W', 'L', 'W', 'D']
      });
    });

    it('computes competitive form before a calendar day', () => {
      expect(formBefore(rows, 54)).toEqual(['W', 'L']);
      expect(formBefore(rows, 61)).toEqual(['W', 'L', 'D']);
      expect(formBefore(rows, null)).toEqual(['W', 'L', 'D']);
    });

    it('selects the next fixture, or the last result once the season is over', () => {
      expect(defaultSelection(rows)?.opponentName).toBe('Next FC');
      expect(defaultSelection(rows.slice(0, 2))?.order).toBe(1);
      expect(defaultSelection([])).toBeNull();
    });
  });

  describe('calendar', () => {
    const anchor = { season: 15, day: 1, dayOfWeek: 'Tuesday' }; // 1 August is a Tuesday
    const rows = buildRows([
      view({ day: 7, date: '7 August', status: 'upcoming' }),
      view({ day: 66, date: '5 October', roundNumber: 4, status: 'upcoming' })
    ], TEAM, [], anchor);
    const months = groupByMonth(rows, true);

    it('derives the weekday of the 1st, carrying it into months without matches', () => {
      expect(months.map(m => m.label)).toEqual(['August', 'September', 'October']);
      expect(firstWeekdays(months)).toEqual([1, 4, 6]);
    });

    it('lays a month out Monday to Sunday', () => {
      const august = buildCalendarMonth(months[0], 1);

      expect(august.aligned).toBeTrue();
      expect(august.weeks[0].map(c => c.day)).toEqual([null, 1, 2, 3, 4, 5, 6]);
      expect(august.weeks[1][0].day).toBe(7);
      expect(august.weeks[1][0].rows.length).toBe(1);
      expect(august.weeks.every(week => week.length === 7)).toBeTrue();
    });

    it('starts on day 1 without weekday alignment when no weekday is known', () => {
      const grid = buildCalendarMonth(months[0], null);
      expect(grid.aligned).toBeFalse();
      expect(grid.weeks[0][0].day).toBe(1);
    });
  });

  describe('labels', () => {
    it('formats relative days and league positions', () => {
      expect(relativeDay(10, 4)).toBe('6 days');
      expect(relativeDay(4, 84)).toBe('80 days ago');
      expect(relativeDay(5, 5)).toBe('today');
      expect(relativeDay(null, 5)).toBeNull();
      expect([1, 2, 3, 4, 11, 12, 21, 22].map(ordinalPosition)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '21st', '22nd']);
    });
  });
});
