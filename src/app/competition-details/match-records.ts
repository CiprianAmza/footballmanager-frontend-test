import { Club, LeagueMatch } from '../league-competition/league-competition.data';

export function resultRecords(matches: LeagueMatch[]) {
  const scored = matches.flatMap(match => {
    const score = match.score?.match(/^(\d+)\s*-\s*(\d+)/);
    return score ? [{ match, goals: +score[1] + +score[2], margin: Math.abs(+score[1] - +score[2]) }] : [];
  });
  return [
    { label: 'Biggest win', match: [...scored].sort((a, b) => b.margin - a.margin)[0]?.match },
    { label: 'Highest-scoring match', match: [...scored].sort((a, b) => b.goals - a.goals)[0]?.match }
  ];
}

export function sequences(matches: LeagueMatch[]) {
  const runs = new Map<number, { club: Club; current: number; best: number }>();
  const update = (teamId: number, teamName: string, unbeaten: boolean) => {
    const row = runs.get(teamId) || { club: { teamId, teamName }, current: 0, best: 0 };
    row.current = unbeaten ? row.current + 1 : 0;
    row.best = Math.max(row.best, row.current);
    runs.set(teamId, row);
  };
  const played = [...matches].sort((a, b) => a.round - b.round || (a.day || 0) - (b.day || 0));
  for (const match of played) {
    const score = match.score?.match(/^(\d+)\s*-\s*(\d+)/);
    if (!score || !match.team1Id || !match.team2Id) continue;
    update(match.team1Id, match.team1Name, +score[1] >= +score[2]);
    update(match.team2Id, match.team2Name, +score[2] >= +score[1]);
  }
  return [...runs.values()].filter(row => row.best > 0).sort((a, b) => b.best - a.best);
}
