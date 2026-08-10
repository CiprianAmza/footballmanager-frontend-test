import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { CompareComponent } from '../../compare/compare.component';
import { PlayerCardComponent } from '../../player-card/player-card.component';
import { ScoutingComponent } from '../../scouting/scouting.component';
import { SharedModule } from '../../shared/shared.module';
import { ShortlistComponent } from '../../shortlist/shortlist.component';
import { TransferPageComponent } from '../../transfer-page/transfer-page.component';

const routes: Routes = [
  { path: 'transfers/:teamId/:season', component: TransferPageComponent, title: 'Transfers' },
  { path: 'scouting', component: ScoutingComponent, title: 'Scouting' },
  { path: 'shortlist', component: ShortlistComponent, title: 'Shortlist' },
  { path: 'compare/:id1/:id2', component: CompareComponent, title: 'Player comparison' },
  { path: 'compare', component: CompareComponent, title: 'Player comparison' },
  { path: 'card/:playerId', component: PlayerCardComponent, title: 'Player card' }
];

@NgModule({
  declarations: [TransferPageComponent, ScoutingComponent, ShortlistComponent, CompareComponent, PlayerCardComponent],
  imports: [SharedModule, RouterModule.forChild(routes)]
})
export class RecruitmentFeatureModule {}
