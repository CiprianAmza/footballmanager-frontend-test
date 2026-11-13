import { LeagueOdds, LeagueOverview } from './league-competition.data';

/**
 * The Media Prediction's title odds come from the backend's 10,000 simulated season ends (design
 * DESIGN_MEDIA_SI_COMPETITII §4), the same numbers as the Title chances page: decimal odds = 1 ÷ title chance.
 * Without them (a past season, or the odds could not be loaded) the column stays empty rather than guessed.
 */
export function withTitleOdds(overview: LeagueOverview, odds: LeagueOdds | null): LeagueOverview {
  const byTeam = new Map((odds?.rows || []).map(row => [row.teamId, row.titleOdds]));
  return {
    ...overview,
    teams: (overview.teams || []).map(team => ({ ...team, titleOdds: byTeam.get(team.teamId) ?? undefined }))
  };
}
