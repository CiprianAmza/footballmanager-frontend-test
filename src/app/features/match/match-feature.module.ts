import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AnimationPreviewComponent } from '../../animation-preview/animation-preview.component';
import { MatchRatingsComponent } from '../../match-ratings/match-ratings.component';
import { SharedModule } from '../../shared/shared.module';
import { SimulateComponent } from '../../simulate/simulate.component';

const routes: Routes = [
  {
    path: 'match/ratings/:competitionId/:season/:round/:teamId1/:teamId2',
    component: MatchRatingsComponent,
    title: 'Match ratings'
  },
  { path: 'simulate', component: SimulateComponent, title: 'Match simulator' },
  { path: 'animation-preview', component: AnimationPreviewComponent, title: 'Animation preview' }
];

@NgModule({
  declarations: [SimulateComponent, AnimationPreviewComponent],
  imports: [SharedModule, RouterModule.forChild(routes)]
})
export class MatchFeatureModule {}
