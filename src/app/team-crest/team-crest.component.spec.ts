import { TeamCrestComponent } from './team-crest.component';

describe('TeamCrestComponent', () => {
  it('uses canonical CSS named colours instead of replacing them with palette fallbacks', () => {
    const crest = new TeamCrestComponent();
    crest.teamId = 1;
    crest.teamName = 'Shadows';
    crest.color1 = 'black';
    crest.color2 = 'grey';

    expect(crest.primary).toBe('black');
    expect(crest.secondary).toBe('grey');
  });

  it('keeps the same deterministic fallback when no canonical colours exist', () => {
    const competitionCrest = new TeamCrestComponent();
    competitionCrest.teamId = 12;
    competitionCrest.teamName = 'Example FC';

    const teamPageCrest = new TeamCrestComponent();
    teamPageCrest.teamId = 12;
    teamPageCrest.teamName = 'Example FC';

    expect(teamPageCrest.primary).toBe(competitionCrest.primary);
    expect(teamPageCrest.secondary).toBe(competitionCrest.secondary);
    expect(teamPageCrest.variant).toBe(competitionCrest.variant);
  });
});
