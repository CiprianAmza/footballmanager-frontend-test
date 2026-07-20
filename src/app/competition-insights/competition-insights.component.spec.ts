import { HttpClient } from '@angular/common/http';

import { TeamService } from '../services/team.service';
import { CompetitionInsightsComponent } from './competition-insights.component';

describe('CompetitionInsightsComponent sorting', () => {
  let component: CompetitionInsightsComponent;

  beforeEach(() => {
    component = new CompetitionInsightsComponent({} as HttpClient, { teamId: 1 } as TeamService);
    component.data = {
      teams: [
        {
          teamName: 'Bravo', entryStage: 'Group Stage', topElevenRating: 180,
          squadValue: 100, monthlyPayroll: 30, reputation: 7000,
          progress: { statusLabel: 'Playing' }
        },
        {
          teamName: 'Alpha', entryStage: 'Qualifying', topElevenRating: 220,
          squadValue: 300, monthlyPayroll: 20, reputation: 8000,
          progress: { statusLabel: 'Qualified' }
        },
        {
          teamName: 'Charlie', entryStage: 'Group Stage', topElevenRating: 200,
          squadValue: 200, monthlyPayroll: 40, reputation: 6000,
          progress: { statusLabel: 'Eliminated' }
        }
      ]
    };
  });

  it('sorts text columns ascending first and toggles to descending', () => {
    component.setSort('teamName');
    expect(component.sortedTeams.map(team => team.teamName)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    component.setSort('teamName');
    expect(component.sortedTeams.map(team => team.teamName)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts numeric columns descending first and toggles to ascending', () => {
    component.setSort('topElevenRating');
    expect(component.sortedTeams.map(team => team.topElevenRating)).toEqual([220, 200, 180]);

    component.setSort('topElevenRating');
    expect(component.sortedTeams.map(team => team.topElevenRating)).toEqual([180, 200, 220]);
  });

  it('sorts nested status labels', () => {
    component.setSort('status');
    expect(component.sortedTeams.map(team => team.progress.statusLabel)).toEqual([
      'Eliminated', 'Playing', 'Qualified'
    ]);
  });
});
