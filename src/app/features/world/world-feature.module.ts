import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AllTimeChampionsComponent } from '../../all-time-champions/all-time-champions.component';
import { AwardCentreComponent } from '../../award-centre/award-centre.component';
import { AwardHistoryComponent } from '../../award-history/award-history.component';
import { CoefficientsComponent } from '../../coefficients/coefficients.component';
import { Coefficients2Component } from '../../coefficients2/coefficients2.component';
import { Coefficients3Component } from '../../coefficients3/coefficients3.component';
import { CompetitionMoneyComponent } from '../../competition-money/competition-money.component';
import { CompetitionsListComponent } from '../../competition-list/competition-list.component';
import { CompetitionInsightsComponent } from '../../competition-insights/competition-insights.component';
import { CompetitionRatingImpactComponent } from '../../competition-rating-impact/competition-rating-impact.component';
import { CompetitionRecordsComponent } from '../../competition-records/competition-records.component';
import { CupOverviewComponent } from '../../competition/cup-overview/cup-overview.component';
import { CompetitionComponent } from '../../competition/competition.component';
import { CompetitionOveriewComponent } from '../../competitionoveriew/competitionoveriew.component';
import { Competitions2Component } from '../../competitions2/competitions2.component';
import { Competitions3Component } from '../../competitions3/competitions3.component';
import { CompetitionsWorldComponent } from '../../competitions-world/competitions-world.component';
import { DisplayComponent } from '../../display/display.component';
import { EuropeanRoundsComponent } from '../../european-rounds/european-rounds.component';
import { LeaguesOverviewComponent } from '../../leagues-overview/leagues-overview.component';
import { ManagerLeaderboardComponent } from '../../manager-leaderboard/manager-leaderboard.component';
import { ManagerProfileComponent } from '../../manager-profile/manager-profile.component';
import { MediaPredictionComponent } from '../../media-prediction/media-prediction.component';
import { PlayerLeaderboardComponent } from '../../player-leaderboard/player-leaderboard.component';
import { ScorerLeaderboardComponent } from '../../scorer-leaderboard/scorer-leaderboard.component';
import { SharedModule } from '../../shared/shared.module';
import { Top3FinishersComponent } from '../../top3-finishers/top3-finishers.component';

const routes: Routes = [
  { path: 'comp/:competitionId', redirectTo: 'competition/:competitionId', pathMatch: 'full' },
  { path: 'competition/:competitionId', component: CompetitionComponent, title: 'Competition' },
  { path: 'rounds', component: DisplayComponent, title: 'Competition rounds' },
  { path: 'competitionoveriew/:competitionId', redirectTo: 'competition-overview/:competitionId', pathMatch: 'full' },
  { path: 'competition-overview/:competitionId', component: CompetitionOveriewComponent, title: 'Competition overview' },
  { path: 'top3-history/:competitionId', component: Top3FinishersComponent },
  { path: 'mediaPrediction/:competitionId', redirectTo: 'media-prediction/:competitionId', pathMatch: 'full' },
  { path: 'media-prediction/:competitionId', component: MediaPredictionComponent, title: 'Media prediction' },
  { path: 'hall-of-fame', component: PlayerLeaderboardComponent, title: 'Hall of fame' },
  { path: 'hall-of-fame/managers', component: ManagerLeaderboardComponent, title: 'Manager hall of fame' },
  { path: 'stats/scorers', component: ScorerLeaderboardComponent, title: 'Top scorers' },
  { path: 'competition-list', component: CompetitionsListComponent, title: 'Competitions' },
  { path: 'competitions2/:teamId', component: Competitions2Component },
  { path: 'competitions2', component: Competitions2Component },
  { path: 'competitions3/:teamId', component: Competitions3Component },
  { path: 'competitions3', component: Competitions3Component },
  { path: 'competitions-world', component: CompetitionsWorldComponent, title: 'Competition world' },
  { path: 'coefficients', component: CoefficientsComponent, title: 'Coefficients' },
  { path: 'coefficients2', component: Coefficients2Component, title: 'Coefficients lab 2' },
  { path: 'coefficients3', component: Coefficients3Component, title: 'Coefficients lab 3' },
  { path: 'competition-money', component: CompetitionMoneyComponent, title: 'Competition prize money' },
  { path: 'european-rounds/:competitionId/:season', component: EuropeanRoundsComponent, title: 'European rounds' },
  { path: 'manager-profile/:managerId', component: ManagerProfileComponent, title: 'Manager profile' },
  { path: 'all-time-champions', component: AllTimeChampionsComponent, title: 'All-time champions' },
  { path: 'overview', component: LeaguesOverviewComponent, title: 'World overview' },
  { path: 'awards/golden-boot', component: AwardHistoryComponent, data: { awardType: 'GOLDEN_BOOT' } },
  { path: 'awards/ballon-dor', component: AwardHistoryComponent, data: { awardType: 'BALLON_DOR' } },
  { path: 'awards/global', component: AwardCentreComponent, data: { global: true } },
  { path: 'awards/competition/:competitionId', component: AwardCentreComponent },
  { path: 'competition-records/:competitionId', component: CompetitionRecordsComponent }
];

@NgModule({
  declarations: [
    CompetitionComponent,
    CupOverviewComponent,
    CompetitionInsightsComponent,
    CompetitionRatingImpactComponent,
    DisplayComponent,
    CompetitionOveriewComponent,
    Top3FinishersComponent,
    MediaPredictionComponent,
    PlayerLeaderboardComponent,
    ScorerLeaderboardComponent,
    CompetitionsListComponent,
    Competitions2Component,
    Competitions3Component,
    CompetitionsWorldComponent,
    CoefficientsComponent,
    Coefficients2Component,
    Coefficients3Component,
    CompetitionMoneyComponent,
    EuropeanRoundsComponent,
    ManagerLeaderboardComponent,
    ManagerProfileComponent,
    AllTimeChampionsComponent,
    LeaguesOverviewComponent,
    AwardHistoryComponent,
    AwardCentreComponent,
    CompetitionRecordsComponent
  ],
  imports: [SharedModule, RouterModule.forChild(routes)]
})
export class WorldFeatureModule {}
