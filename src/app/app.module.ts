import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { CompetitionComponent } from './competition/competition.component';
import { TacticDisplayComponent } from './tacticdisplay/tacticdisplay.component';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptor } from './services/auth.interceptor';
import { DisplayComponent } from './display/display.component';
import { CompetitionDisplayComponent } from './competitiondisplay/competitiondisplay.component';
import { CompetitionOveriewComponent } from './competitionoveriew/competitionoveriew.component';
import { SquadComponent } from './squad/squad.component';
import { TransferPageComponent } from './transfer-page/transfer-page.component';
import { Top3FinishersComponent } from './top3-finishers/top3-finishers.component';
import { TacticPageComponent } from './tactic-page/tactic-page.component';
import { PlayerComponent } from './player/player.component';
import { TacticComponent } from './tactic/tactic.component';
import { MediaPredictionComponent } from './media-prediction/media-prediction.component';
import { PlayerCompetitionHistoryComponent } from './player-competition-history/player-competition-history.component';
import { PlayerHistoryComponent } from './player-history/player-history.component';
import { FixturesComponent } from './fixtures/fixtures.component';
import { PlayerLeaderboardComponent } from './player-leaderboard/player-leaderboard.component';
import { ScorerLeaderboardComponent } from './scorer-leaderboard/scorer-leaderboard.component';
import { HomeComponent } from './home/home.component';
import { AdminComponent } from './admin/admin.component';
import { AdminScoresComponent } from './admin/admin-scores/admin-scores.component';
import { AdminOffersComponent } from './admin/admin-offers/admin-offers.component';
import { AdminPlayersComponent } from './admin/admin-players/admin-players.component';
import { AdminAwardsComponent } from './admin/admin-awards/admin-awards.component';
import { AdminDrawsComponent } from './admin/admin-draws/admin-draws.component';
import { AdminTransfersComponent } from './admin/admin-transfers/admin-transfers.component';
import { TacticsAdvisorComponent } from './tactics-advisor/tactics-advisor.component';
import { SimulateComponent } from './simulate/simulate.component';
import { InboxComponent } from './inbox/inbox.component';
import { TacticsComponent } from './tactics/tactics.component';
import { Tactics1Component } from './tactics1/tactics1.component';
import { Tactics2Component } from './tactics2/tactics2.component';
import { Tactics3Component } from './tactics3/tactics3.component';
import { Tactics4Component } from './tactics4/tactics4.component';
import { Tactics5Component } from './tactics5/tactics5.component';
import { PlayerAnalyticsComponent } from './player-analytics/player-analytics.component';
import { BoardroomHubComponent } from './boardroom/boardroom-hub.component';
import { BoardroomWealthComponent } from './boardroom/boardroom-wealth.component';
import { BoardroomAssetsComponent } from './boardroom/boardroom-assets.component';
import { BoardroomOwnershipComponent } from './boardroom/boardroom-ownership.component';
import { ScoutingComponent } from './scouting/scouting.component';
import { SquadPlannerComponent } from './squad-planner/squad-planner.component';
import { DynamicsComponent } from './dynamics/dynamics.component';
import { CommonModule } from '@angular/common';
import { CompetitionsListComponent } from './competition-list/competition-list.component';
import { FinancesComponent } from './finances/finances.component';
import { CupOverviewComponent } from './competition/cup-overview/cup-overview.component';
import { ClubInfoComponent } from './club-info/club-info.component';
import { DevCenterComponent } from './dev-center/dev-center.component';
import { TrainingComponent } from './training/training.component';
import { MedicalCentreComponent } from './medical-centre/medical-centre.component';
import { StaffComponent } from './staff/staff.component';
import { DataHubComponent } from './data-hub/data-hub.component';
import { StadiumComponent } from './stadium/stadium.component';
import { TeamHistoryComponent } from './team-history/team-history.component';
import { TeamSquadComponent } from './team-squad/team-squad.component';
import { TeamTacticsComponent } from './team-tactics/team-tactics.component';
import { TeamTransfersComponent } from './team-transfers/team-transfers.component';
import { CoefficientsComponent } from './coefficients/coefficients.component';
import { EuropeanRoundsComponent } from './european-rounds/european-rounds.component';
import { ManagerLeaderboardComponent } from './manager-leaderboard/manager-leaderboard.component';
import { ManagerProfileComponent } from './manager-profile/manager-profile.component';
import { JobSearchComponent } from './job-search/job-search.component';
import { YouthAcademyComponent } from './youth-academy/youth-academy.component';
import { GameSetupComponent } from './game-setup/game-setup.component';
import { SeasonSummaryComponent } from './season-summary/season-summary.component';
import { ShortlistComponent } from './shortlist/shortlist.component';
import { LoginComponent } from './login/login.component';
import { CompareComponent } from './compare/compare.component';
import { AllTimeChampionsComponent } from './all-time-champions/all-time-champions.component';
import { AnimationPreviewComponent } from './animation-preview/animation-preview.component';
import { AssistantManagerComponent } from './assistant-manager/assistant-manager.component';
import { FriendlyComponent } from './friendly/friendly.component';
import { LeaguesOverviewComponent } from './leagues-overview/leagues-overview.component';
import { RatingColorPipe, RatingTierClassPipe, RatingTierNamePipe } from './services/rating-color.pipe';
import { PlayerFaceComponent } from './player-face/player-face.component';
import { PlayerCardComponent } from './player-card/player-card.component';
import { MatchRatingsComponent } from './match-ratings/match-ratings.component';
import { CoachControlComponent } from './boardroom/coach-control.component';
import { PlayerGalleryComponent } from './player-gallery/player-gallery.component';
import { TeamCrestComponent } from './team-crest/team-crest.component';
import { AwardHistoryComponent } from './award-history/award-history.component';
import { AwardCentreComponent } from './award-centre/award-centre.component';
import { CompetitionInsightsComponent } from './competition-insights/competition-insights.component';
import { CompetitionRatingImpactComponent } from './competition-rating-impact/competition-rating-impact.component';
import { CompetitionRecordsComponent } from './competition-records/competition-records.component';

@NgModule({
  declarations: [
    AppComponent,
    PlayerFaceComponent,
    PlayerCardComponent,
    MatchRatingsComponent,
    CoachControlComponent,
    PlayerGalleryComponent,
    TeamCrestComponent,
    AwardHistoryComponent,
    AwardCentreComponent,
    CompetitionInsightsComponent,
    CompetitionRatingImpactComponent,
    CompetitionRecordsComponent,
    CompetitionComponent,
    TacticDisplayComponent,
    CompetitionComponent,
    DisplayComponent,
    SquadComponent,
    CompetitionDisplayComponent,
    CompetitionOveriewComponent,
    TransferPageComponent,
    Top3FinishersComponent,
    TacticPageComponent,
    PlayerComponent,
    TacticComponent,
    MediaPredictionComponent,
    PlayerCompetitionHistoryComponent,
    PlayerHistoryComponent,
    FixturesComponent,
    PlayerLeaderboardComponent,
    ScorerLeaderboardComponent,
    HomeComponent,
    AdminComponent,
    AdminScoresComponent,
    AdminOffersComponent,
    AdminPlayersComponent,
    AdminAwardsComponent,
    AdminDrawsComponent,
    AdminTransfersComponent,
    TacticsAdvisorComponent,
    SimulateComponent,
    InboxComponent,
    TacticsComponent,
    Tactics1Component,
    Tactics2Component,
    Tactics3Component,
    Tactics4Component,
    Tactics5Component,
    PlayerAnalyticsComponent,
    BoardroomHubComponent,
    BoardroomWealthComponent,
    BoardroomAssetsComponent,
    BoardroomOwnershipComponent,
    ScoutingComponent,
    SquadPlannerComponent,
    DynamicsComponent,
    CompetitionsListComponent,
    FinancesComponent,
    CupOverviewComponent,
    ClubInfoComponent,
    DevCenterComponent,
    TrainingComponent,
    MedicalCentreComponent,
    StaffComponent,
    DataHubComponent,
    StadiumComponent,
    TeamHistoryComponent,
    TeamSquadComponent,
    TeamTacticsComponent,
    TeamTransfersComponent,
    CoefficientsComponent,
    EuropeanRoundsComponent,
    ManagerLeaderboardComponent,
    ManagerProfileComponent,
    JobSearchComponent,
    YouthAcademyComponent,
    GameSetupComponent,
    SeasonSummaryComponent,
    ShortlistComponent,
    LoginComponent,
    CompareComponent,
    AllTimeChampionsComponent,
    AnimationPreviewComponent,
    AssistantManagerComponent,
    FriendlyComponent,
    LeaguesOverviewComponent,
    RatingColorPipe,
    RatingTierClassPipe,
    RatingTierNamePipe
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule,
    CommonModule
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
