import {
  DEFAULT_FILTERS, ScheduleView, buildRow, buildRows, competitionOptions, defaultSelection,
  filterRows, formBefore, groupByMonth, hasActiveFilters, resultNote, summarise
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
        venueName: 'Arena'
      }), TEAM);

      expect(row.played).toBeTrue();
      expect(row.outcome).toBe('W');
      expect([row.homeGoals, row.awayGoals]).toEqual([2, 1]);
      expect(row.opponentId).toBe(12);
      expect(row.stageLabel).toBe('Matchday 3');
      expect(row.competitionKind).toBe('league');
      expect(row.competitionLink).toBe(1);
      expect(row.venueName).toBe('Arena');
      expect(row.monthLabel).toBe('September');
      expect(row.dayOfMonth).toBe(5);
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
    });

    it('treats unplayed matches as fixtures without a report', () => {
      const row = buildRow(view({ status: 'upcoming', reportAvailable: false }), TEAM);

      expect(row.played).toBeFalse();
      expect(row.outcome).toBeNull();
      expect(row.homeGoals).toBeNull();
      expect(row.reportLink).toBeNull();
    });

    it('does not link friendlies to a competition or report', () => {
      const row = buildRow(view({
        competitionId: -4, competitionName: 'Summer Cup · SEMI_FINAL', score: '1 - 1', status: 'played',
        reportAvailable: false, competitionType: 'Friendly'
      }), TEAM);

      expect(row.competitionKind).toBe('friendly');
      expect(row.competitionLink).toBeNull();
      expect(row.reportLink).toBeNull();
      expect(row.stageLabel).toBe('Semi final');
      expect(row.outcome).toBe('D');
    });

    it('marks matches without a recorded calendar day', () => {
      const row = buildRow(view({ day: 0, date: 'Matchday 3', unknownFields: ['day', 'date'] }), TEAM);

      expect(row.dateKnown).toBeFalse();
      expect(row.day).toBeNull();
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

    it('describes legs and extra time when no structured scores exist', () => {
      expect(resultNote(view({ legNumber: 1, decidedBy: 'FIRST_LEG' }), 'H')).toBe('1st leg');
      expect(resultNote(view({ legNumber: 2 }), 'H')).toBe('2nd leg');
      expect(resultNote(view({ decidedBy: 'EXTRA_TIME' }), 'H')).toBe('a.e.t.');
      expect(resultNote(view({ legNumber: 0, decidedBy: 'NORMAL' }), 'H')).toBeNull();
    });
  });

  describe('lists', () => {
    const rows = buildRows([
      view({ roundNumber: 1, day: 10, date: '20 August', score: '1 - 0', status: 'played', teamId2: 11 }),
      view({ roundNumber: 2, day: 17, date: '27 August', score: '0 - 2', status: 'played', homeOrAway: 'A', teamId1: 13, teamId2: TEAM }),
      view({ roundNumber: 7, day: 20, date: '30 August', competitionId: -2, competitionName: 'Friendly', score: '5 - 0', status: 'played', teamId2: 14 }),
      view({ roundNumber: 1, day: 24, date: '3 September', competitionId: 5, competitionName: 'Cupa', competitionType: 'Cup', score: '1 - 1', status: 'played', teamId2: 15 }),
      view({ roundNumber: 3, day: 31, date: '10 September', status: 'upcoming', opponentTeam: 'Next FC', teamId2: 16 })
    ], TEAM);

    it('keeps the backend order and groups consecutive months', () => {
      expect(rows.map(r => r.order)).toEqual([0, 1, 2, 3, 4]);
      expect(groupByMonth(rows).map(g => [g.label, g.rows.length])).toEqual([['August', 3], ['September', 2]]);
    });

    it('filters by show, competition, venue, result and search', () => {
      expect(filterRows(rows, { ...DEFAULT_FILTERS, show: 'fixtures' }).length).toBe(1);
      expect(filterRows(rows, { ...DEFAULT_FILTERS, show: 'results' }).length).toBe(4);
      expect(filterRows(rows, { ...DEFAULT_FILTERS, competition: 'c5' }).map(r => r.competitionId)).toEqual([5]);
      expect(filterRows(rows, { ...DEFAULT_FILTERS, competition: 'friendly' }).length).toBe(1);
      expect(filterRows(rows, { ...DEFAULT_FILTERS, venue: 'A' }).length).toBe(1);
      expect(filterRows(rows, { ...DEFAULT_FILTERS, result: 'L' }).length).toBe(1);
      expect(filterRows(rows, { ...DEFAULT_FILTERS, search: 'next' }).length).toBe(1);
      expect(hasActiveFilters(DEFAULT_FILTERS)).toBeFalse();
      expect(hasActiveFilters({ ...DEFAULT_FILTERS, venue: 'H' })).toBeTrue();
    });

    it('lists competitions league first, friendlies last', () => {
      expect(competitionOptions(rows).map(o => [o.key, o.count])).toEqual([['c1', 3], ['c5', 1], ['friendly', 1]]);
    });

    it('summarises the visible matches', () => {
      expect(summarise(rows)).toEqual({
        played: 4, upcoming: 1, wins: 2, draws: 1, losses: 1, goalsFor: 7, goalsAgainst: 3, form: ['W', 'L', 'W', 'D']
      });
    });

    it('computes competitive form before a calendar day', () => {
      expect(formBefore(rows, 24)).toEqual(['W', 'L']);
      expect(formBefore(rows, 31)).toEqual(['W', 'L', 'D']);
      expect(formBefore(rows, null)).toEqual(['W', 'L', 'D']);
    });

    it('selects the next fixture, or the last result once the season is over', () => {
      expect(defaultSelection(rows)?.opponentName).toBe('Next FC');
      expect(defaultSelection(rows.slice(0, 2))?.order).toBe(1);
      expect(defaultSelection([])).toBeNull();
    });
  });
});
