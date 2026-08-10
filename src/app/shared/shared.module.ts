import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { PlayerFaceComponent } from '../player-face/player-face.component';
import { MatchPitch3dComponent } from '../live-match/match-pitch3d.component';
import { MatchPitchComponent } from '../live-match/match-pitch.component';
import { MatchRatingsComponent } from '../match-ratings/match-ratings.component';
import { RatingColorPipe, RatingTierClassPipe, RatingTierNamePipe } from '../services/rating-color.pipe';
import { TeamCrestComponent } from '../team-crest/team-crest.component';
import { DataTableComponent } from './data-table.component';
import { EmptyStateComponent } from './empty-state.component';
import { FmIconComponent } from './fm-icon.component';
import { IconButtonComponent } from './icon-button.component';
import { GlobalSearchComponent } from './global-search.component';
import { ModalComponent } from './modal.component';
import { MoneyComponent } from './money.component';
import { PageHeaderComponent } from './page-header.component';
import { PlayerInfoPopoverComponent } from './player-info-popover.component';
import { RatingEstimateComponent } from './rating-estimate.component';
import { RouteSemanticHeaderComponent } from './route-semantic-header.component';
import { SkeletonComponent } from './skeleton.component';
import { TabsComponent } from './tabs.component';
import { ToastComponent } from './toast.component';
import { UiFeedbackHostComponent } from './ui-feedback-host.component';
import { FmGameDatePipe, FmMoneyPipe, FmPercentPipe, FmRatingPipe } from './ui-formatters';
import { UiStateComponent } from './ui-state.component';

const SHARED_DECLARATIONS = [
  PlayerFaceComponent,
  MatchPitchComponent,
  MatchPitch3dComponent,
  MatchRatingsComponent,
  TeamCrestComponent,
  RatingColorPipe,
  RatingTierClassPipe,
  RatingTierNamePipe,
  FmMoneyPipe,
  FmPercentPipe,
  FmRatingPipe,
  FmGameDatePipe,
  UiFeedbackHostComponent,
  UiStateComponent,
  PageHeaderComponent,
  FmIconComponent,
  RouteSemanticHeaderComponent,
  TabsComponent,
  DataTableComponent,
  MoneyComponent,
  RatingEstimateComponent,
  PlayerInfoPopoverComponent,
  ModalComponent,
  ToastComponent,
  SkeletonComponent,
  EmptyStateComponent,
  IconButtonComponent,
  GlobalSearchComponent
];

@NgModule({
  declarations: SHARED_DECLARATIONS,
  imports: [CommonModule, FormsModule, RouterModule],
  exports: [CommonModule, FormsModule, RouterModule, ...SHARED_DECLARATIONS]
})
export class SharedModule {}
