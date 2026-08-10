import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AssistantManagerComponent } from '../../assistant-manager/assistant-manager.component';
import { ClubInfoComponent } from '../../club-info/club-info.component';
import { DataHubComponent } from '../../data-hub/data-hub.component';
import { DataHub2Component } from '../../data-hub2/data-hub2.component';
import { DataHub3Component } from '../../data-hub3/data-hub3.component';
import { FixturesComponent } from '../../fixtures/fixtures.component';
import { MedicalCentreComponent } from '../../medical-centre/medical-centre.component';
import { PlayerAnalyticsComponent } from '../../player-analytics/player-analytics.component';
import { PlayerCompetitionHistoryComponent } from '../../player-competition-history/player-competition-history.component';
import { PlayerGalleryComponent } from '../../player-gallery/player-gallery.component';
import { PlayerComponent } from '../../player/player.component';
import { SharedModule } from '../../shared/shared.module';
import { SquadPlannerComponent } from '../../squad-planner/squad-planner.component';
import { SquadComponent } from '../../squad/squad.component';
import { Squad2Component } from '../../squad2/squad2.component';
import { Squad3Component } from '../../squad3/squad3.component';
import { TacticsAdvisorComponent } from '../../tactics-advisor/tactics-advisor.component';
import { Tactics1Component } from '../../tactics1/tactics1.component';
import { Tactics2Component } from '../../tactics2/tactics2.component';
import { Tactics3Component } from '../../tactics3/tactics3.component';
import { Tactics4Component } from '../../tactics4/tactics4.component';
import { Tactics5Component } from '../../tactics5/tactics5.component';
import { TrainingComponent } from '../../training/training.component';
import { Training1Component } from '../../training1/training1.component';
import { Training2Component } from '../../training2/training2.component';
import { Training3Component } from '../../training3/training3.component';
import { Training4Component } from '../../training4/training4.component';

const routes: Routes = [
  { path: 'squad', component: SquadComponent, title: 'Squad' },
  { path: 'squad2/:teamId', component: Squad2Component, title: 'Squad lab 2' },
  { path: 'squad2', component: Squad2Component, title: 'Squad lab 2' },
  { path: 'squad3/:teamId', component: Squad3Component, title: 'Squad lab 3' },
  { path: 'squad3', component: Squad3Component, title: 'Squad lab 3' },
  { path: 'player/:playerId', component: PlayerComponent, title: 'Player' },
  { path: 'playerHistory/:playerId', redirectTo: 'player-history/:playerId', pathMatch: 'full' },
  { path: 'player-history/:playerId', component: PlayerCompetitionHistoryComponent, title: 'Player history' },
  { path: 'tactic', component: Tactics4Component, title: 'Tactics' },
  { path: 'tactics/:teamId', component: Tactics4Component, title: 'Tactics' },
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
  { path: 'tactics', component: TacticsAdvisorComponent, title: 'Tactics advisor' },
  { path: 'admin/tactics-advisor', component: TacticsAdvisorComponent, title: 'Tactics advisor' },
  { path: 'fixtures/:teamId', component: FixturesComponent, title: 'Fixtures' },
  { path: 'fixtures', component: FixturesComponent, title: 'Fixtures' },
  { path: 'squad-planner', component: SquadPlannerComponent, title: 'Squad planner' },
  { path: 'team/:teamId', component: ClubInfoComponent, title: 'Club' },
  { path: 'training', component: TrainingComponent, title: 'Training' },
  { path: 'training1', component: Training1Component },
  { path: 'training2', component: Training2Component },
  { path: 'training3', component: Training3Component },
  { path: 'training4', component: Training4Component },
  { path: 'medical', component: MedicalCentreComponent, title: 'Medical centre' },
  { path: 'data-hub', component: DataHubComponent, title: 'Data Hub' },
  { path: 'data-hub2', component: DataHub2Component, title: 'Data Hub 2' },
  { path: 'data-hub3', component: DataHub3Component, title: 'Data Hub 3' },
  { path: 'assistant', component: AssistantManagerComponent, title: 'Assistant manager' },
  { path: 'gallery/:teamId', component: PlayerGalleryComponent, title: 'Player gallery' },
  { path: 'gallery', component: PlayerGalleryComponent, title: 'Player gallery' }
];

@NgModule({
  declarations: [
    SquadComponent,
    Squad2Component,
    Squad3Component,
    PlayerComponent,
    PlayerAnalyticsComponent,
    PlayerCompetitionHistoryComponent,
    FixturesComponent,
    Tactics1Component,
    Tactics2Component,
    Tactics3Component,
    Tactics4Component,
    Tactics5Component,
    TacticsAdvisorComponent,
    SquadPlannerComponent,
    ClubInfoComponent,
    TrainingComponent,
    Training1Component,
    Training2Component,
    Training3Component,
    Training4Component,
    MedicalCentreComponent,
    DataHubComponent,
    DataHub2Component,
    DataHub3Component,
    AssistantManagerComponent,
    PlayerGalleryComponent
  ],
  imports: [SharedModule, RouterModule.forChild(routes)]
})
export class TeamFeatureModule {}
