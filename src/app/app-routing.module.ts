import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CompetitionComponent } from './competition/competition.component';
import { DisplayComponent } from './display/display.component';
import { CompetitionOveriewComponent } from './competitionoveriew/competitionoveriew.component';
import { SquadComponent } from './squad/squad.component';
import { TransferPageComponent } from './transfer-page/transfer-page.component';
import { Top3FinishersComponent } from './top3-finishers/top3-finishers.component';
import { TacticPageComponent } from './tactic-page/tactic-page.component';
import { PlayerComponent } from './player/player.component';
import { TacticComponent } from './tactic/tactic.component';
import { MediaPredictionComponent } from './media-prediction/media-prediction.component';
import { PlayerCompetitionHistoryComponent } from './player-competition-history/player-competition-history.component';
import { FixturesComponent } from './fixtures/fixtures.component';
import { PlayerLeaderboardComponent } from './player-leaderboard/player-leaderboard.component';
import { ScorerLeaderboardComponent } from './scorer-leaderboard/scorer-leaderboard.component';
import { HomeComponent } from './home/home.component';
import { LeaguesOverviewComponent } from './leagues-overview/leagues-overview.component';
import { InboxComponent } from './inbox/inbox.component';
import { Tactics1Component } from './tactics1/tactics1.component';
import { Tactics2Component } from './tactics2/tactics2.component';
import { Tactics3Component } from './tactics3/tactics3.component';
import { Tactics4Component } from './tactics4/tactics4.component';
import { Tactics5Component } from './tactics5/tactics5.component';
import { BoardroomHubComponent } from './boardroom/boardroom-hub.component';
import { BoardroomWealthComponent } from './boardroom/boardroom-wealth.component';
import { BoardroomAssetsComponent } from './boardroom/boardroom-assets.component';
import { BoardroomOwnershipComponent } from './boardroom/boardroom-ownership.component';
import { ScoutingComponent } from './scouting/scouting.component';
import { SquadPlannerComponent } from './squad-planner/squad-planner.component';
import { DynamicsComponent } from './dynamics/dynamics.component';
import { CompetitionsListComponent } from './competition-list/competition-list.component';
import { CommonModule } from '@angular/common';
import { FinancesComponent } from './finances/finances.component';
import { ClubInfoComponent } from './club-info/club-info.component';
import { DevCenterComponent } from './dev-center/dev-center.component';
import { TrainingComponent } from './training/training.component';
import { MedicalCentreComponent } from './medical-centre/medical-centre.component';
import { StaffComponent } from './staff/staff.component';
import { DataHubComponent } from './data-hub/data-hub.component';
import { StadiumComponent } from './stadium/stadium.component';
import { TeamHistoryComponent } from './team-history/team-history.component';
import { CoefficientsComponent } from './coefficients/coefficients.component';
import { EuropeanRoundsComponent } from './european-rounds/european-rounds.component';
import { ManagerLeaderboardComponent } from './manager-leaderboard/manager-leaderboard.component';
import { ManagerProfileComponent } from './manager-profile/manager-profile.component';
import { JobSearchComponent } from './job-search/job-search.component';
import { YouthAcademyComponent } from './youth-academy/youth-academy.component';
import { SeasonSummaryComponent } from './season-summary/season-summary.component';
import { ShortlistComponent } from './shortlist/shortlist.component';
import { CompareComponent } from './compare/compare.component';
import { AllTimeChampionsComponent } from './all-time-champions/all-time-champions.component';
import { AnimationPreviewComponent } from './animation-preview/animation-preview.component';
import { AssistantManagerComponent } from './assistant-manager/assistant-manager.component';
import { FriendlyComponent } from './friendly/friendly.component';
import { AdminComponent } from './admin/admin.component';
import { AdminScoresComponent } from './admin/admin-scores/admin-scores.component';
import { AdminOffersComponent } from './admin/admin-offers/admin-offers.component';
import { AdminPlayersComponent } from './admin/admin-players/admin-players.component';
import { AdminAwardsComponent } from './admin/admin-awards/admin-awards.component';
import { AdminDrawsComponent } from './admin/admin-draws/admin-draws.component';
import { AdminTransfersComponent } from './admin/admin-transfers/admin-transfers.component';
import { TacticsAdvisorComponent } from './tactics-advisor/tactics-advisor.component';
import { SimulateComponent } from './simulate/simulate.component';
import { PlayerCardComponent } from './player-card/player-card.component';
import { MatchRatingsComponent } from './match-ratings/match-ratings.component';
import { CoachControlComponent } from './boardroom/coach-control.component';
import { PlayerGalleryComponent } from './player-gallery/player-gallery.component';
import { AwardHistoryComponent } from './award-history/award-history.component';
import { AwardCentreComponent } from './award-centre/award-centre.component';
import { CompetitionRecordsComponent } from './competition-records/competition-records.component';

const routes: Routes = [
  { path: 'card/:playerId', component: PlayerCardComponent },
  { path: 'match/ratings/:competitionId/:season/:round/:teamId1/:teamId2', component: MatchRatingsComponent },
  { path: 'boardroom/coach-control/:teamId', component: CoachControlComponent },
  { path: 'boardroom/coach-control', component: CoachControlComponent },
  { path: 'comp/:competitionId', component: CompetitionComponent },
  { path: 'competition/:competitionId', component: CompetitionComponent },
  { path: 'rounds', component: DisplayComponent },
  { path: 'competitionoveriew/:competitionId', component: CompetitionOveriewComponent },
  { path: 'squad', component: SquadComponent },
  { path: 'transfers/:teamId/:season', component: TransferPageComponent },
  { path: 'top3-history/:competitionId', component: Top3FinishersComponent},
  { path: 'tactic', component: Tactics4Component},
  { path: 'player/:playerId', component: PlayerComponent},
  { path: 'tactics/:teamId', component: Tactics4Component },
  { path: 'tactics1/:teamId', component: Tactics1Component },
  { path: 'tactics2/:teamId', component: Tactics2Component },
  { path: 'tactics3/:teamId', component: Tactics3Component },
  { path: 'tactics4/:teamId', component: Tactics4Component },
  { path: 'tactics5/:teamId', component: Tactics5Component },
  { path: 'tactics1', component: Tactics1Component },
  { path: 'tactics2', component: Tactics2Component },
  { path: 'tactics3', component: Tactics3Component },
  { path: 'tactics4', component: Tactics4Component },
  { path: 'tactics5', component: Tactics5Component },
  { path: 'boardroom', component: BoardroomHubComponent },
  { path: 'boardroom/wealth', component: BoardroomWealthComponent },
  { path: 'boardroom/assets/:humanId', component: BoardroomAssetsComponent },
  { path: 'boardroom/ownership/:humanId', component: BoardroomOwnershipComponent },
  { path: 'boardroom/ownership', component: BoardroomOwnershipComponent },
  { path: 'mediaPrediction/:competitionId', component: MediaPredictionComponent},
  { path: 'playerHistory/:playerId', component: PlayerCompetitionHistoryComponent },
  { path: 'fixtures/:teamId', component: FixturesComponent },
  { path: 'fixtures', component: FixturesComponent },
  { path: 'hall-of-fame', component: PlayerLeaderboardComponent },
  { path: 'stats/scorers', component: ScorerLeaderboardComponent },
  { path: 'home', component: HomeComponent },
  { path: 'inbox', component: InboxComponent },
  { path: 'tactics', component: TacticsAdvisorComponent },
  { path: 'simulate', component: SimulateComponent },
  { path: 'scouting', component: ScoutingComponent },
  { path: 'squad-planner', component: SquadPlannerComponent },
  { path: 'squad-dynamics', component: DynamicsComponent },
  { path: 'competition-list', component: CompetitionsListComponent },
  { path: 'finances', component: FinancesComponent },
  { path: 'team/:teamId', component: ClubInfoComponent }, 
  { path: 'dev-center', component: DevCenterComponent },
  { path: 'training', component: TrainingComponent },
  { path: 'medical', component: MedicalCentreComponent },
  { path: 'staff', component: StaffComponent },
  { path: 'data-hub', component: DataHubComponent },
  { path: 'stadium', component: StadiumComponent },
  { path: 'team-history/:teamId', component: TeamHistoryComponent },
  { path: 'coefficients', component: CoefficientsComponent },
  { path: 'european-rounds/:competitionId/:season', component: EuropeanRoundsComponent },
  { path: 'hall-of-fame/managers', component: ManagerLeaderboardComponent },
  { path: 'manager-profile/:managerId', component: ManagerProfileComponent },
  { path: 'job-search', component: JobSearchComponent },
  { path: 'youth-academy', component: YouthAcademyComponent },
  { path: 'season-summary/:season', component: SeasonSummaryComponent },
  { path: 'season-summary', component: SeasonSummaryComponent },
  { path: 'shortlist', component: ShortlistComponent },
  { path: 'compare/:id1/:id2', component: CompareComponent },
  { path: 'compare', component: CompareComponent },
  { path: 'all-time-champions', component: AllTimeChampionsComponent },
  { path: 'animation-preview', component: AnimationPreviewComponent },
  { path: 'assistant', component: AssistantManagerComponent },
  { path: 'friendlies', component: FriendlyComponent },
  { path: 'admin/scores', component: AdminScoresComponent },
  { path: 'admin/offers', component: AdminOffersComponent },
  { path: 'admin/players', component: AdminPlayersComponent },
  { path: 'admin/awards', component: AdminAwardsComponent },
  { path: 'admin/draws', component: AdminDrawsComponent },
  { path: 'admin/transfers', component: AdminTransfersComponent },
  { path: 'admin/tactics-advisor', component: TacticsAdvisorComponent },
  { path: 'admin', component: AdminComponent },
  { path: 'overview', component: LeaguesOverviewComponent },
  { path: 'awards/golden-boot', component: AwardHistoryComponent, data: { awardType: 'GOLDEN_BOOT' } },
  { path: 'awards/ballon-dor', component: AwardHistoryComponent, data: { awardType: 'BALLON_DOR' } },
  { path: 'awards/global', component: AwardCentreComponent, data: { global: true } },
  { path: 'awards/competition/:competitionId', component: AwardCentreComponent },
  { path: 'competition-records/:competitionId', component: CompetitionRecordsComponent },
  { path: 'gallery/:teamId', component: PlayerGalleryComponent },
  { path: 'gallery', component: PlayerGalleryComponent },

  { path: '', redirectTo: '/home', pathMatch: 'full' }
  
];


@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
