import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { urlApp } from '../../app.component';

interface BracketMatch {
  matchIndex: number;
  team1Id: number;
  team2Id: number;
  team1Name: string | null;
  team2Name: string | null;
  score: string | null;
}

interface BracketRound {
  round: number;
  matches: BracketMatch[];
}

interface CupBracket {
  cupId: number;
  cupName: string;
  season: number;
  rounds: BracketRound[];
}

interface DisplayMatch {
  homeTeam: string;
  awayTeam: string;
  score: string;          // actual score, or '-' if not played
  winner: 'home' | 'away' | null;
  isPlaceholderHome: boolean;
  isPlaceholderAway: boolean;
}

@Component({
  selector: 'app-cup-overview',
  templateUrl: './cup-overview.component.html',
  styleUrls: ['./cup-overview.component.css']
})
export class CupOverviewComponent implements OnInit, OnChanges {

  @Input() competitionId!: string;
  @Input() season!: string;

  bracket: CupBracket | null = null;
  matches: DisplayMatch[] = [];
  loading: boolean = false;

  roundNames: string[] = [];
  currentRoundIndex: number = 0;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.loadBracket();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['competitionId'] && !changes['competitionId'].firstChange) ||
        (changes['season'] && !changes['season'].firstChange)) {
      this.currentRoundIndex = 0;
      this.loadBracket();
    }
  }

  /**
   * Loads the FULL bracket (all rounds, all matches) in one call.
   * Placeholders (team1Id/team2Id = 0) become "Winner of M{idx}" labels so
   * the user sees the entire path even before the prelim draw is decided.
   */
  loadBracket(): void {
    this.loading = true;
    const url = `${urlApp}/competition/cupBracket/${this.competitionId}/${this.season}`;
    this.http.get<CupBracket>(url).subscribe({
      next: (data) => {
        this.bracket = data;
        this.roundNames = this.buildRoundNames(data.rounds);
        this.currentRoundIndex = Math.min(this.currentRoundIndex, Math.max(0, data.rounds.length - 1));
        this.renderCurrentRound();
        this.loading = false;
      },
      error: () => {
        this.bracket = null;
        this.matches = [];
        this.roundNames = [];
        this.loading = false;
      }
    });
  }

  /**
   * Names rounds from the END (final = last) so the prelim shows up first
   * with a proper "Preliminary" label when present.
   * For total=4 with first-round-count > main-bracket size convention:
   *   - last round = Final
   *   - second-to-last = Semi-Final
   *   - third-to-last = Quarter-Final
   *   - any earlier round whose match count != next power-of-2 expected for
   *     a "round of N" is labelled "Preliminary"
   */
  buildRoundNames(rounds: BracketRound[]): string[] {
    if (!rounds || rounds.length === 0) return [];
    const total = rounds.length;
    const names: string[] = new Array(total);
    // Standard knockout names from the back
    for (let i = total - 1; i >= 0; i--) {
      const fromEnd = total - i;
      if (fromEnd === 1) names[i] = 'Final';
      else if (fromEnd === 2) names[i] = 'Semi-Final';
      else if (fromEnd === 3) names[i] = 'Quarter-Final';
      else if (fromEnd === 4) names[i] = 'Round of 16';
      else if (fromEnd === 5) names[i] = 'Round of 32';
      else names[i] = 'Round of ' + Math.pow(2, fromEnd - 1);
    }
    // If the first round has fewer matches than the second, it's the prelim
    if (total >= 2 && rounds[0].matches.length < rounds[1].matches.length) {
      names[0] = 'Preliminary';
    }
    return names;
  }

  private renderCurrentRound(): void {
    if (!this.bracket || this.bracket.rounds.length === 0) {
      this.matches = [];
      return;
    }
    const round = this.bracket.rounds[this.currentRoundIndex];
    if (!round) {
      this.matches = [];
      return;
    }

    // Build a map from previous round's match index → its outcome label.
    // For a placeholder slot in this round, we know it's "winner of match j"
    // in the previous round (j = 2*matchIndex - 1 for team1, 2*matchIndex for team2).
    const prevRound = this.currentRoundIndex > 0 ? this.bracket.rounds[this.currentRoundIndex - 1] : null;

    this.matches = round.matches.map(m => {
      const home = this.resolveSlotName(m.team1Id, m.team1Name, prevRound, m.matchIndex * 2 - 1);
      const away = this.resolveSlotName(m.team2Id, m.team2Name, prevRound, m.matchIndex * 2);

      const score = (m.score === null || m.score === undefined) ? '-' : m.score;
      return {
        homeTeam: home.label,
        awayTeam: away.label,
        score,
        winner: this.calculateWinner(score),
        isPlaceholderHome: home.isPlaceholder,
        isPlaceholderAway: away.isPlaceholder,
      };
    });
  }

  private resolveSlotName(
    teamId: number,
    teamName: string | null,
    prevRound: BracketRound | null,
    prevMatchIndex: number
  ): { label: string; isPlaceholder: boolean } {
    if (teamId > 0 && teamName) {
      return { label: teamName, isPlaceholder: false };
    }
    // Placeholder — describe where the team will come from
    if (prevRound) {
      return { label: `Winner of M${prevMatchIndex}`, isPlaceholder: true };
    }
    return { label: 'TBD', isPlaceholder: true };
  }

  prevRound(): void {
    if (this.currentRoundIndex > 0) {
      this.currentRoundIndex--;
      this.renderCurrentRound();
    }
  }

  nextRound(): void {
    if (this.currentRoundIndex < this.roundNames.length - 1) {
      this.currentRoundIndex++;
      this.renderCurrentRound();
    }
  }

  get currentRoundName(): string {
    return this.roundNames[this.currentRoundIndex] || '';
  }

  private calculateWinner(score: string): 'home' | 'away' | null {
    if (!score || score === '-' || score.includes(':')) return null;
    const parts = score.split('-');
    if (parts.length !== 2) return null;
    const h = parseInt(parts[0]);
    const a = parseInt(parts[1]);
    if (isNaN(h) || isNaN(a)) return null;
    if (h > a) return 'home';
    if (a > h) return 'away';
    return null;
  }
}
