import { NgModule } from '@angular/core';
import { RouterModule, Routes, UrlMatchResult, UrlSegment } from '@angular/router';

import { AdminAwardsComponent } from './admin/admin-awards/admin-awards.component';
import { AdminDrawsComponent } from './admin/admin-draws/admin-draws.component';
import { AdminOffersComponent } from './admin/admin-offers/admin-offers.component';
import { AdminPlayersComponent } from './admin/admin-players/admin-players.component';
import { AdminScoresComponent } from './admin/admin-scores/admin-scores.component';
import { AdminTransfersComponent } from './admin/admin-transfers/admin-transfers.component';
import { AdminComponent } from './admin/admin.component';
import { BoardroomAssetsComponent } from './boardroom/boardroom-assets.component';
import { BoardroomHubComponent } from './boardroom/boardroom-hub.component';
import { BoardroomOwnershipComponent } from './boardroom/boardroom-ownership.component';
import { BoardroomWealthComponent } from './boardroom/boardroom-wealth.component';
import { CoachControlComponent } from './boardroom/coach-control.component';
import { ChairmanClubComponent } from './chairman-club/chairman-club.component';
import { EconomyDashboardComponent } from './economy/economy-dashboard.component';
import { PublicEconomyProfileComponent } from './economy/public-economy-profile.component';
import { WealthRankingsComponent } from './economy/wealth-rankings.component';
import { FaceGalleryComponent } from './face-lab/face-gallery.component';
import { DevOnlyGuard } from './face-lab/dev-only.guard';
import { FeatureUnavailableComponent } from './feature-unavailable/feature-unavailable.component';
import { HomeComponent } from './home/home.component';
import { Home2Component } from './home2/home2.component';
import { Home3Component } from './home3/home3.component';
import { InboxComponent } from './inbox/inbox.component';
import { Inbox2Component } from './inbox2/inbox2.component';
import { Inbox3Component } from './inbox3/inbox3.component';
import { SocialFeedComponent } from './social-feed/social-feed.component';
import { MarketComponent } from './market/market.component';
import { PortfolioComponent } from './market/portfolio.component';
import { MultiplayerRoomComponent } from './multiplayer/multiplayer-room.component';
import { NotFoundComponent } from './not-found/not-found.component';
import { PhaseLabComponent } from './phase-lab/phase-lab.component';
import { ChairmanRegentGuard } from './services/chairman-regent.guard';
import { LegacyBoardroomGuard } from './services/legacy-boardroom.guard';
import { RegentGuard } from './services/regent.guard';
import { SettingsComponent } from './settings/settings.component';
import { ARENA_SAME_ORIGIN } from './tactic-arena/arena-env';

function prefixMatcher(prefixes: readonly string[], segments: UrlSegment[]): UrlMatchResult | null {
  return segments.length > 0 && prefixes.includes(segments[0].path) ? { consumed: [] } : null;
}

export function teamFeatureMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  return prefixMatcher([
    'squad', 'squad2', 'squad3', 'player', 'playerHistory', 'player-history',
    'tactic', 'tactics', 'tactics1', 'tactics2', 'tactics3', 'tactics4', 'tactics5',
    'fixtures', 'squad-planner', 'team', 'training', 'training1', 'training2',
    'training3', 'training4', 'medical', 'data-hub', 'data-hub2', 'data-hub3',
    'assistant', 'gallery', 'admin'
  ], segments);
}

export function matchFeatureMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  return prefixMatcher(['match', 'simulate', 'animation-preview'], segments);
}

export function recruitmentFeatureMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  return prefixMatcher(['transfers', 'scouting', 'shortlist', 'compare', 'card'], segments);
}

export function clubFeatureMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  return prefixMatcher([
    'finances', 'staff', 'staff2', 'staff3', 'stadium', 'team-history', 'job-search',
    'youth-academy', 'academy', 'academy2', 'academy3', 'season-summary',
    'friendlies', 'friendlies2', 'friendlies3'
  ], segments);
}

export function worldFeatureMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  return prefixMatcher([
    'comp', 'competition', 'competition-view', 'rounds', 'competitionoveriew', 'competition-overview',
    'top3-history', 'mediaPrediction', 'media-prediction', 'hall-of-fame', 'stats',
    'competition-list', 'competition-rankings', 'value-rankings', 'competitions2', 'competitions3', 'competitions-world',
    'coefficients', 'coefficients2', 'coefficients3', 'competition-money',
    'european-rounds', 'manager-profile', 'all-time-champions', 'overview', 'awards',
    'competition-records'
  ], segments);
}

export const APP_ROUTES: Routes = [
  { path: 'multiplayer', component: MultiplayerRoomComponent },
  { path: 'economy', component: EconomyDashboardComponent, canActivate: [RegentGuard] },
  { path: 'market', component: MarketComponent, canActivate: [RegentGuard] },
  { path: 'portfolio', component: PortfolioComponent, canActivate: [RegentGuard] },
  { path: 'wealth-rankings', component: WealthRankingsComponent, canActivate: [RegentGuard] },
  { path: 'people/:profileId', component: PublicEconomyProfileComponent, canActivate: [RegentGuard] },
  { path: 'chairman/clubs', component: ChairmanClubComponent, canActivate: [ChairmanRegentGuard] },
  { path: 'chairman/clubs/:teamId', component: ChairmanClubComponent, canActivate: [ChairmanRegentGuard] },
  { path: 'boardroom/coach-control/:teamId', component: CoachControlComponent, canActivate: [LegacyBoardroomGuard] },
  { path: 'boardroom/coach-control', component: CoachControlComponent, canActivate: [LegacyBoardroomGuard] },
  { path: 'boardroom/assets', component: BoardroomAssetsComponent, canActivate: [LegacyBoardroomGuard] },
  { path: 'boardroom', component: BoardroomHubComponent, canActivate: [LegacyBoardroomGuard] },
  { path: 'boardroom/wealth', component: BoardroomWealthComponent, canActivate: [LegacyBoardroomGuard] },
  { path: 'boardroom/assets/:humanId', component: BoardroomAssetsComponent, canActivate: [LegacyBoardroomGuard] },
  { path: 'boardroom/ownership/:humanId', component: BoardroomOwnershipComponent, canActivate: [LegacyBoardroomGuard] },
  { path: 'boardroom/ownership', component: BoardroomOwnershipComponent, canActivate: [LegacyBoardroomGuard] },
  {
    path: 'home',
    loadComponent: () => import('./home-today/home-today.component').then(module => module.HomeTodayComponent),
    title: 'Today · Manager briefing'
  },
  { path: 'home-classic', component: HomeComponent },
  { path: 'home2', component: Home2Component },
  { path: 'home3', component: Home3Component },
  {
    path: 'home4',
    loadComponent: () => import('./home4/home4.component').then(module => module.Home4Component),
    title: 'Director dashboard'
  },
  {
    path: 'squad4/:teamId',
    loadComponent: () => import('./squad4/squad4.component').then(module => module.Squad4Component),
    title: 'Squad register'
  },
  {
    path: 'squad4',
    loadComponent: () => import('./squad4/squad4.component').then(module => module.Squad4Component),
    title: 'Squad register'
  },
  {
    path: 'tactics6/:teamId',
    loadComponent: () => import('./tactics6/tactics6.component').then(module => module.Tactics6Component),
    title: 'Tactical selection studio'
  },
  {
    path: 'tactics6',
    loadComponent: () => import('./tactics6/tactics6.component').then(module => module.Tactics6Component),
    title: 'Tactical selection studio'
  },
  {
    path: 'tactic-arena',
    loadComponent: () => import('./tactic-arena/tactic-arena-leaderboard.component').then(module => module.TacticArenaLeaderboardComponent),
    title: 'Tactic Arena'
  },
  {
    path: 'tactic-arena/new',
    loadComponent: () => import('./tactic-arena/tactic-arena-new.component').then(module => module.TacticArenaNewComponent),
    title: 'Tactic Arena · new test'
  },
  {
    path: 'tactic-arena/:id',
    loadComponent: () => import('./tactic-arena/tactic-arena-test.component').then(module => module.TacticArenaTestComponent),
    title: 'Tactic Arena · test'
  },
  {
    path: 'match-centre2/:matchKey',
    loadComponent: () => import('./match-centre2/match-centre2.component').then(module => module.MatchCentre2Component),
    title: 'Broadcast match centre'
  },
  {
    path: 'match-report2/:competitionId/:season/:round/:teamId1/:teamId2',
    loadComponent: () => import('./match-report2/match-report2.component').then(module => module.MatchReport2Component),
    title: 'Post-match report'
  },
  {
    path: 'player2/:playerId',
    loadComponent: () => import('./player2/player2.component').then(module => module.Player2Component),
    title: 'Classic player profile'
  },
  {
    path: 'ui-lab',
    loadComponent: () => import('./ui-comparison/ui-comparison.component').then(module => module.UiComparisonComponent),
    title: 'UI comparison lab'
  },
  { path: 'inbox', component: Inbox2Component, title: 'Inbox' },
  {
    path: 'agent/:id',
    loadComponent: () => import('./agent/agent.component').then(module => module.AgentComponent),
    title: 'Agent'
  },
  {
    path: 'club-negotiation/:id',
    loadComponent: () => import('./club-negotiation/club-negotiation.component').then(module => module.ClubNegotiationComponent),
    title: 'Transfer talks'
  },
  {
    path: 'board-meeting',
    loadComponent: () => import('./board-meeting/board-meeting.component').then(module => module.BoardMeetingComponent),
    title: 'Meeting with the board'
  },
  {
    path: 'staff-meeting',
    loadComponent: () => import('./staff-meeting/staff-meeting.component').then(module => module.StaffMeetingComponent),
    title: 'Staff meeting'
  },
  {
    path: 'press-conference',
    loadComponent: () => import('./first-press-conference/first-press-conference.component').then(module => module.FirstPressConferenceComponent),
    title: 'Press conference'
  },
  {
    path: 'squad-meeting',
    loadComponent: () => import('./squad-meeting/squad-meeting.component').then(module => module.SquadMeetingComponent),
    title: 'Squad meeting'
  },
  {
    path: 'conduct',
    loadComponent: () => import('./conduct/conduct.component').then(module => module.ConductComponent),
    title: 'Code of conduct'
  },
  {
    path: 'negotiation/:id',
    loadComponent: () => import('./negotiation/negotiation.component').then(module => module.NegotiationComponent),
    title: 'Negotiation'
  },
  { path: 'inbox-classic', component: InboxComponent },
  { path: 'inbox2', component: Inbox2Component },
  { path: 'inbox3', component: Inbox3Component },
  { path: 'social-feed', component: SocialFeedComponent, title: 'Social Feed' },
  { path: 'settings', component: SettingsComponent, title: 'Settings' },
  { path: 'admin/scores', component: AdminScoresComponent },
  { path: 'admin/offers', component: AdminOffersComponent },
  { path: 'admin/players', component: AdminPlayersComponent },
  { path: 'admin/awards', component: AdminAwardsComponent },
  { path: 'admin/draws', component: AdminDrawsComponent },
  { path: 'admin/transfers', component: AdminTransfersComponent },
  { path: 'admin', component: AdminComponent },
  { path: 'squad-dynamics', component: FeatureUnavailableComponent, data: { featureName: 'Squad Dynamics' } },
  { path: 'club-vision', component: FeatureUnavailableComponent, title: 'Club vision', data: { featureName: 'Club Vision' } },
  { path: 'dev-center', component: FeatureUnavailableComponent, data: { featureName: 'Development Centre' } },
  { path: 'dev/face-gallery', component: FaceGalleryComponent, canActivate: [DevOnlyGuard] },
  { path: 'dev/phase-lab', component: PhaseLabComponent, canActivate: [DevOnlyGuard] },

  {
    matcher: teamFeatureMatcher,
    loadChildren: () => import('./features/team/team-feature.module').then(module => module.TeamFeatureModule)
  },
  {
    matcher: matchFeatureMatcher,
    loadChildren: () => import('./features/match/match-feature.module').then(module => module.MatchFeatureModule)
  },
  {
    matcher: recruitmentFeatureMatcher,
    loadChildren: () => import('./features/recruitment/recruitment-feature.module').then(module => module.RecruitmentFeatureModule)
  },
  {
    matcher: clubFeatureMatcher,
    loadChildren: () => import('./features/club/club-feature.module').then(module => module.ClubFeatureModule)
  },
  {
    matcher: worldFeatureMatcher,
    loadChildren: () => import('./features/world/world-feature.module').then(module => module.WorldFeatureModule)
  },

  { path: '', redirectTo: ARENA_SAME_ORIGIN ? '/tactic-arena' : '/home', pathMatch: 'full' },
  { path: '**', component: NotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(APP_ROUTES)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
