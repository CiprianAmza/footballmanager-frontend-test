import { LeagueMatch, Standing } from './league-competition.data';

export function leaguePositionTimeline(matches: LeagueMatch[], clubs: Standing[]) {
  const byId = new Map(clubs.map(club => [club.teamId, { club, points: 0, difference: 0, goals: 0, ranks: [] as number[] }]));
  const played = new Map<number, LeagueMatch[]>();
  for (const match of matches) {
    if (!match.score) continue;
    const round = played.get(match.round) || [];
    round.push(match);
    played.set(match.round, round);
  }
  const rounds = [...played.keys()].sort((a, b) => a - b);
  for (const round of rounds) {
    for (const match of played.get(round) || []) {
      const score = match.score?.match(/^(\d+)\s*-\s*(\d+)/);
      const home = byId.get(match.team1Id || 0);
      const away = byId.get(match.team2Id || 0);
      if (!score || !home || !away) continue;
      const homeGoals = +score[1];
      const awayGoals = +score[2];
      home.points += homeGoals === awayGoals ? 1 : homeGoals > awayGoals ? 3 : 0;
      away.points += homeGoals === awayGoals ? 1 : awayGoals > homeGoals ? 3 : 0;
      home.difference += homeGoals - awayGoals;
      away.difference += awayGoals - homeGoals;
      home.goals += homeGoals;
      away.goals += awayGoals;
    }
    const ranked = [...byId.values()].sort((a, b) => b.points - a.points || b.difference - a.difference || b.goals - a.goals);
    ranked.forEach(row => row.ranks.push(ranked.findIndex(other =>
      other.points === row.points && other.difference === row.difference && other.goals === row.goals) + 1));
  }
  return { rounds, clubs: [...byId.values()] };
}
