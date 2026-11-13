import { LeagueOverview } from './league-competition.data';

// Use the same Best XI strength as Media Prediction. A minimum spread keeps
// closely matched leagues near even, and the strongest club gets at most
// three times the title probability of the weakest.
export function estimatedTitleOdds(overview: LeagueOverview): LeagueOverview {
  const teams = overview.teams || [];
  const eligible = teams.filter(team => Number.isFinite(team.topElevenRating) && team.topElevenRating > 0);
  if (!teams.length || eligible.length !== teams.length) return overview;
  const ratings = eligible.map(team => team.topElevenRating);
  const strongest = Math.max(...ratings);
  const spread = Math.max(15, strongest - Math.min(...ratings));
  const weights = teams.map(team => Math.pow(3, (team.topElevenRating - strongest) / spread));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return { ...overview, teams: teams.map((team, i) => ({ ...team, titleOdds: total / weights[i] })) };
}
