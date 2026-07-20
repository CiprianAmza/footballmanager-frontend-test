import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlApp } from '../app.component';

export interface UpcomingMatch {
  competitionId: number;
  competitionName: string;
  seasonNumber: number;
  roundNumber: number;
  day: number;
  team1Id: number;
  team1Name: string;
  team2Id: number;
  team2Name: string;
  predeterminedId?: number;
  predeterminedTeam1Score?: number;
  predeterminedTeam2Score?: number;
}

export interface PredeterminedScore {
  id: number;
  competitionId: number;
  seasonNumber: number;
  roundNumber: number;
  team1Id: number;
  team2Id: number;
  team1Score: number;
  team2Score: number;
  consumed: boolean;
}

export interface TacticOption {
  formation: string;
  mentality: string;
  tempo: string;
  passingType: string;
  inPossession: string;
  timeWasting: string;
  expectedGoalDifference: number;
  expectedPoints: number;
}

export interface BestTacticResponse {
  teamId: number;
  teamName: string;
  recommendedFormation: string;
  recommendedMentality: string;
  recommendedTempo: string;
  recommendedPassingType: string;
  recommendedInPossession: string;
  recommendedTimeWasting: string;
  expectedGoalDifference: number;
  expectedPoints: number;
  winProbability: number;
  drawProbability: number;
  lossProbability: number;
  baseSquadValue: number;
  top: TacticOption[];
}

export interface BallonDorCandidate {
  rank: number;
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  position: string;
  appearances: number;
  goals: number;
  assists: number;
  weightedGoals: number;
  weightedAssists: number;
  averageRating: number;
  votingPoints: number;
  firstPlaceVotes: number;
  selected: boolean;
  baseFaceId: number;
  skinTone: number;
  hairStyle: number;
  hairColor: number;
  eyeColor: number;
  faceShape: number;
  noseShape: number;
  eyeShape: number;
  mouthShape: number;
  browShape: number;
  species: string;
}

export interface BallonDorAdminState {
  season: number;
  finalized: boolean;
  recommendedWinnerId: number | null;
  overrideWinnerId: number | null;
  winnerId: number | null;
  adminSelected: boolean;
  candidates: BallonDorCandidate[];
}

export interface AdminTeamOption {
  id: number;
  name: string;
}

export type AdminMovementType = 'PERMANENT' | 'FREE_AGENT' | 'LOAN';
export type AdminMovementExecution = 'NOW' | 'START_OF_SEASON';

export interface AdminTransferPlayer {
  id: number;
  name: string;
  position: string;
  age: number;
  rating: number;
  teamId: number | null;
  teamName: string;
  wage: number;
  transferValue: number;
  contractEndSeason: number;
  contractSeasonsRemaining: number;
  activeLoan: boolean;
}

export interface AdminPlayerMovement {
  id: number;
  movementType: AdminMovementType;
  executionMode: AdminMovementExecution;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  playerId: number;
  playerName: string;
  sourceTeamId: number | null;
  sourceTeamName: string;
  destinationTeamId: number;
  destinationTeamName: string;
  transferFee: number;
  wage: number;
  contractSeasons: number;
  loanSeasons: number;
  parentWageContribution: number;
  createdSeason: number;
  executionSeason: number;
  createdAt: number;
  completedAt: number;
  failureReason?: string | null;
}

export interface AdminTransferState {
  currentSeason: number;
  movements: AdminPlayerMovement[];
}

export interface ContractExtensionResult {
  success: boolean;
  scope: string;
  seasonsAdded: number;
  contractsExtended: number;
  teamsAffected: number;
  preContractsCleared: number;
  earliestNewExpiry: number | null;
  latestNewExpiry: number | null;
}

export interface AdminFundingOption {
  code: string;
  label: string;
  category: string;
  description: string;
}

export interface AdminFundingResult {
  success: boolean;
  teamId: number;
  teamName: string;
  amount: number;
  reason: string;
  reasonLabel: string;
  category: string;
  description: string;
  season: number;
  day: number;
  totalFinances: number;
  transferBudget: number;
  transferBudgetAdded: number;
}

export interface AdminDrawTeam {
  teamId: number;
  teamName: string;
  coefficient?: number;
  reputation?: number;
  potNumber?: number;
}

export interface AdminDrawPairing {
  team1Id: number;
  team2Id: number;
}

export interface AdminDrawStage {
  competitionId: number;
  competitionName: string;
  competitionTypeId?: number;
  season: number;
  round: number;
  matchday?: number;
  stageLabel: string;
  drawMode: 'PAIRINGS' | 'GROUPS';
  participants: AdminDrawTeam[];
  expectedTeams: number;
  expectedPairings: number;
  byeSlots: number;
  groupCount?: number;
  groupSize?: number;
  existingPairings?: AdminDrawPairing[];
  canEdit: boolean;
  status: string;
  statusLabel: string;
  drawDate?: string;
  matchDate?: string;
  source: 'EUROPEAN_DRAW' | 'DOMESTIC_BRACKET';
}

const TOKEN_STORAGE_KEY = 'fm_admin_token';

@Injectable({ providedIn: 'root' })
export class AdminService {

  constructor(private http: HttpClient) {}

  get token(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  get isAuthenticated(): boolean {
    return !!this.token;
  }

  private authHeaders(): HttpHeaders {
    return new HttpHeaders({ 'X-Admin-Token': this.token || '' });
  }

  login(username: string, password: string): Observable<{ success: boolean; token?: string; message?: string }> {
    return this.http.post<any>(urlApp + '/admin/login', { username, password });
  }

  storeToken(token: string): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  getUpcomingMatches(): Observable<UpcomingMatch[]> {
    return this.http.get<UpcomingMatch[]>(urlApp + '/admin/upcomingMatches', { headers: this.authHeaders() });
  }

  setScore(payload: {
    competitionId: number;
    seasonNumber: number;
    roundNumber: number;
    team1Id: number;
    team2Id: number;
    team1Score: number;
    team2Score: number;
  }): Observable<{ success: boolean; id: number }> {
    return this.http.post<any>(urlApp + '/admin/setScore', payload, { headers: this.authHeaders() });
  }

  listPredetermined(): Observable<PredeterminedScore[]> {
    return this.http.get<PredeterminedScore[]>(urlApp + '/admin/predeterminedScores', { headers: this.authHeaders() });
  }

  deletePredetermined(id: number): Observable<{ success: boolean }> {
    return this.http.delete<any>(urlApp + `/admin/predeterminedScore/${id}`, { headers: this.authHeaders() });
  }

  // ===== Job offer admin controls =====

  jobOfferState(): Observable<{ jobOffersEnabled: boolean; forceJobOfferOnNextAdvance: boolean }> {
    return this.http.get<any>(urlApp + '/admin/jobOffers/state', { headers: this.authHeaders() });
  }

  setJobOffersEnabled(enabled: boolean): Observable<{ jobOffersEnabled: boolean }> {
    return this.http.post<any>(urlApp + '/admin/jobOffers/setEnabled', { enabled }, { headers: this.authHeaders() });
  }

  forceNextOffer(): Observable<{ forceJobOfferOnNextAdvance: boolean }> {
    return this.http.post<any>(urlApp + '/admin/jobOffers/forceNext', {}, { headers: this.authHeaders() });
  }

  generateOfferNow(userId: number, teamId: number): Observable<any> {
    return this.http.post<any>(urlApp + '/admin/jobOffers/generateNow', { userId, teamId }, { headers: this.authHeaders() });
  }

  listAdminUsers(): Observable<{ id: number; username: string; teamId: number | null }[]> {
    return this.http.get<any>(urlApp + '/admin/users', { headers: this.authHeaders() });
  }

  // ===== Best Tactic advisor =====

  /**
   * Recommended tactic computed from the team's CURRENT database squad values.
   * Returns the best formation + 5 settings plus a ranked top-15 list.
   */
  bestTactic(teamId: number): Observable<BestTacticResponse> {
    return this.http.get<BestTacticResponse>(
      urlApp + `/admin/bestTactic/${teamId}`,
      { headers: this.authHeaders() }
    );
  }

  // ===== Generate player =====

  /** Generate a new player and (optionally) assign to a team. */
  generatePlayer(payload: {
    teamId?: number;
    name?: string;
    position: string;
    age?: number;
    rating: number;
  }): Observable<any> {
    return this.http.post<any>(urlApp + '/admin/generatePlayer', payload, { headers: this.authHeaders() });
  }

  // ===== Ballon d'Or winner control =====

  ballonDorState(season?: number): Observable<BallonDorAdminState> {
    const suffix = season == null ? '' : `?season=${season}`;
    return this.http.get<BallonDorAdminState>(
      urlApp + `/admin/awards/ballon-dor${suffix}`,
      { headers: this.authHeaders() }
    );
  }

  setBallonDorWinner(season: number, winnerId: number): Observable<BallonDorAdminState> {
    return this.http.post<BallonDorAdminState>(
      urlApp + '/admin/awards/ballon-dor/override',
      { season, winnerId },
      { headers: this.authHeaders() }
    );
  }

  clearBallonDorWinner(season: number): Observable<BallonDorAdminState> {
    return this.http.delete<BallonDorAdminState>(
      urlApp + `/admin/awards/ballon-dor/override?season=${season}`,
      { headers: this.authHeaders() }
    );
  }

  // ===== Bulk contract extension =====

  listTeams(): Observable<AdminTeamOption[]> {
    return this.http.get<AdminTeamOption[]>(urlApp + '/teams/all');
  }

  extendContracts(payload: {
    seasons: number;
    allTeams: boolean;
    teamId?: number;
  }): Observable<ContractExtensionResult> {
    return this.http.post<ContractExtensionResult>(
      urlApp + '/admin/contracts/extend',
      payload,
      { headers: this.authHeaders() }
    );
  }

  // ===== Club funding =====

  fundingOptions(): Observable<AdminFundingOption[]> {
    return this.http.get<AdminFundingOption[]>(
      urlApp + '/admin/finances/funding-options',
      { headers: this.authHeaders() }
    );
  }

  withdrawalOptions(): Observable<AdminFundingOption[]> {
    return this.http.get<AdminFundingOption[]>(
      urlApp + '/admin/finances/withdrawal-options',
      { headers: this.authHeaders() }
    );
  }

  addClubFunding(payload: {
    teamId: number;
    amount: number;
    reason: string;
    note?: string;
  }): Observable<AdminFundingResult> {
    return this.http.post<AdminFundingResult>(
      urlApp + '/admin/finances/funding',
      payload,
      { headers: this.authHeaders() }
    );
  }

  removeClubFunding(payload: {
    teamId: number;
    amount: number;
    reason: string;
    note?: string;
  }): Observable<AdminFundingResult> {
    return this.http.post<AdminFundingResult>(
      urlApp + '/admin/finances/withdrawal',
      payload,
      { headers: this.authHeaders() }
    );
  }

  // ===== Admin Transfer Centre =====

  adminTransferState(): Observable<AdminTransferState> {
    return this.http.get<AdminTransferState>(urlApp + '/admin/transfers', {
      headers: this.authHeaders()
    });
  }

  adminTransferPlayers(sourceTeamId: number | null, freeAgents: boolean, query = ''): Observable<AdminTransferPlayer[]> {
    const params: string[] = [`freeAgents=${freeAgents}`];
    if (sourceTeamId != null) params.push(`sourceTeamId=${sourceTeamId}`);
    if (query.trim()) params.push(`query=${encodeURIComponent(query.trim())}`);
    return this.http.get<AdminTransferPlayer[]>(
      urlApp + `/admin/transfers/players?${params.join('&')}`,
      { headers: this.authHeaders() }
    );
  }

  createAdminTransfer(payload: {
    type: AdminMovementType;
    playerId: number;
    destinationTeamId: number;
    transferFee: number;
    wage?: number;
    contractSeasons?: number;
    loanSeasons?: number;
    parentWageContribution?: number;
    executionMode: AdminMovementExecution;
    executionSeason?: number;
  }): Observable<AdminPlayerMovement> {
    return this.http.post<AdminPlayerMovement>(urlApp + '/admin/transfers', payload, {
      headers: this.authHeaders()
    });
  }

  cancelAdminTransfer(movementId: number): Observable<AdminPlayerMovement> {
    return this.http.delete<AdminPlayerMovement>(urlApp + `/admin/transfers/${movementId}`, {
      headers: this.authHeaders()
    });
  }

  // ===== Competition draw control =====

  listManualDraws(): Observable<AdminDrawStage[]> {
    return this.http.get<AdminDrawStage[]>(
      urlApp + '/admin/draws',
      { headers: this.authHeaders() }
    );
  }

  completeManualDraw(payload: {
    competitionId: number;
    season: number;
    round: number;
    pairings: AdminDrawPairing[];
    byeTeamId: number | null;
    groups: { groupNumber: number; teamIds: number[] }[];
  }): Observable<{ success: boolean; message: string; stageLabel: string }> {
    return this.http.post<any>(
      urlApp + '/admin/draws/complete',
      payload,
      { headers: this.authHeaders() }
    );
  }
}
