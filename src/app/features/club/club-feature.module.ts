import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { Academy2Component } from '../../academy2/academy2.component';
import { Academy3Component } from '../../academy3/academy3.component';
import { FinancesComponent } from '../../finances/finances.component';
import { FriendlyComponent } from '../../friendly/friendly.component';
import { Friendlies2Component } from '../../friendlies2/friendlies2.component';
import { Friendlies3Component } from '../../friendlies3/friendlies3.component';
import { JobSearchComponent } from '../../job-search/job-search.component';
import { SeasonSummaryComponent } from '../../season-summary/season-summary.component';
import { SharedModule } from '../../shared/shared.module';
import { StadiumComponent } from '../../stadium/stadium.component';
import { StaffComponent } from '../../staff/staff.component';
import { Staff2Component } from '../../staff2/staff2.component';
import { Staff3Component } from '../../staff3/staff3.component';
import { TeamHistoryComponent } from '../../team-history/team-history.component';
import { YouthAcademyComponent } from '../../youth-academy/youth-academy.component';

const routes: Routes = [
  { path: 'finances', component: FinancesComponent, title: 'Finances' },
  { path: 'staff', component: StaffComponent, title: 'Staff' },
  { path: 'staff2', component: Staff2Component, title: 'Staff lab 2' },
  { path: 'staff3', component: Staff3Component, title: 'Staff lab 3' },
  { path: 'stadium', component: StadiumComponent, title: 'Stadium & facilities' },
  { path: 'team-history/:teamId', component: TeamHistoryComponent, title: 'Club history' },
  { path: 'job-search', component: JobSearchComponent, title: 'Job search' },
  { path: 'youth-academy', component: YouthAcademyComponent, title: 'Youth academy' },
  { path: 'academy', component: YouthAcademyComponent, title: 'Youth academy' },
  { path: 'academy2', component: Academy2Component, title: 'Academy lab 2' },
  { path: 'academy3', component: Academy3Component, title: 'Academy lab 3' },
  { path: 'season-summary/:season', component: SeasonSummaryComponent, title: 'Season summary' },
  { path: 'season-summary', component: SeasonSummaryComponent, title: 'Season summary' },
  { path: 'friendlies', component: FriendlyComponent, title: 'Friendlies' },
  { path: 'friendlies2/:teamId', component: Friendlies2Component, title: 'Friendlies lab 2' },
  { path: 'friendlies2', component: Friendlies2Component, title: 'Friendlies lab 2' },
  { path: 'friendlies3/:teamId', component: Friendlies3Component, title: 'Friendlies lab 3' },
  { path: 'friendlies3', component: Friendlies3Component, title: 'Friendlies lab 3' }
];

@NgModule({
  declarations: [
    FinancesComponent,
    StaffComponent,
    Staff2Component,
    Staff3Component,
    StadiumComponent,
    TeamHistoryComponent,
    JobSearchComponent,
    YouthAcademyComponent,
    Academy2Component,
    Academy3Component,
    SeasonSummaryComponent,
    FriendlyComponent,
    Friendlies2Component,
    Friendlies3Component
  ],
  imports: [SharedModule, RouterModule.forChild(routes)]
})
export class ClubFeatureModule {}
