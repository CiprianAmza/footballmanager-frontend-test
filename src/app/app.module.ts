import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { AdminAwardsComponent } from './admin/admin-awards/admin-awards.component';
import { AdminDrawsComponent } from './admin/admin-draws/admin-draws.component';
import { AdminOffersComponent } from './admin/admin-offers/admin-offers.component';
import { AdminPlayersComponent } from './admin/admin-players/admin-players.component';
import { AdminScoresComponent } from './admin/admin-scores/admin-scores.component';
import { AdminTransfersComponent } from './admin/admin-transfers/admin-transfers.component';
import { AdminComponent } from './admin/admin.component';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
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
import { ParametricFaceComponent } from './face-lab/parametric-face.component';
import { FeatureUnavailableComponent } from './feature-unavailable/feature-unavailable.component';
import { GameSetupComponent } from './game-setup/game-setup.component';
import { HomeComponent } from './home/home.component';
import { Home2Component } from './home2/home2.component';
import { Home3Component } from './home3/home3.component';
import { InboxComponent } from './inbox/inbox.component';
import { Inbox2Component } from './inbox2/inbox2.component';
import { Inbox3Component } from './inbox3/inbox3.component';
import { SocialFeedComponent } from './social-feed/social-feed.component';
import { LiveMatchComponent } from './live-match/live-match.component';
import { LoginComponent } from './login/login.component';
import { MarketComponent } from './market/market.component';
import { PortfolioComponent } from './market/portfolio.component';
import { MultiplayerContinueComponent } from './multiplayer/multiplayer-continue.component';
import { MultiplayerRoomComponent } from './multiplayer/multiplayer-room.component';
import { NotFoundComponent } from './not-found/not-found.component';
import { PhaseLabComponent } from './phase-lab/phase-lab.component';
import { AuthInterceptor } from './services/auth.interceptor';
import { SharedModule } from './shared/shared.module';
import { SettingsComponent } from './settings/settings.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    GameSetupComponent,
    LiveMatchComponent,
    MultiplayerRoomComponent,
    MultiplayerContinueComponent,
    HomeComponent,
    Home2Component,
    Home3Component,
    InboxComponent,
    Inbox2Component,
    Inbox3Component,
    SocialFeedComponent,
    AdminComponent,
    AdminScoresComponent,
    AdminOffersComponent,
    AdminPlayersComponent,
    AdminAwardsComponent,
    AdminDrawsComponent,
    AdminTransfersComponent,
    BoardroomHubComponent,
    BoardroomWealthComponent,
    BoardroomAssetsComponent,
    BoardroomOwnershipComponent,
    CoachControlComponent,
    EconomyDashboardComponent,
    WealthRankingsComponent,
    PublicEconomyProfileComponent,
    MarketComponent,
    PortfolioComponent,
    FeatureUnavailableComponent,
    NotFoundComponent,
    ChairmanClubComponent,
    FaceGalleryComponent,
    ParametricFaceComponent,
    PhaseLabComponent,
    SettingsComponent
  ],
  imports: [BrowserModule, FormsModule, HttpClientModule, SharedModule, AppRoutingModule],
  providers: [{ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }],
  bootstrap: [AppComponent]
})
export class AppModule {}
