import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AcademyIntelligenceService, AcademyOverview, YouthFacilityOption } from '../services/academy-intelligence.service';
import { TeamService } from '../services/team.service';
import { GameEventsService } from '../services/game-events.service';

@Component({selector:'app-academy2',templateUrl:'./academy2.component.html',styleUrls:['../academy-lab.css']})
export class Academy2Component implements OnInit {
  data?:AcademyOverview; loading=true; error=''; message=''; rankingScope:'league'|'world'='league'; upgrading='';
  constructor(private api:AcademyIntelligenceService,public team:TeamService,private events:GameEventsService,private router:Router){}
  ngOnInit():void{this.load();}
  load():void{this.loading=true;this.error='';this.api.overview(this.team.teamId).subscribe({next:data=>{this.data=data;this.loading=false;},error:()=>{this.error='Academy intelligence could not be loaded.';this.loading=false;}});}
  get ranking(){const rows=[...(this.data?.ranking||[])];return this.rankingScope==='league'?rows.filter(row=>row.leagueRank>0).sort((a,b)=>a.leagueRank-b.leagueRank):rows.sort((a,b)=>a.worldRank-b.worldRank);}
  upgrade(facility:YouthFacilityOption):void{if(!facility.canUpgrade||this.upgrading)return;this.upgrading=facility.type;this.message='';this.api.upgrade(facility.type).subscribe({next:result=>{this.upgrading='';this.message=result?`${facility.name} upgrade started.`:'Upgrade could not be started. Check club funds.';if(result){this.events.emit('stadium','finances');this.load();}},error:()=>{this.upgrading='';this.message='Upgrade could not be started.';}});}
  money(value:number):string{return value>=1e6?`€${(value/1e6).toFixed(1)}m`:value>=1e3?`€${(value/1e3).toFixed(0)}k`:`€${value}`;}
  levelWidth(level:number):number{return Math.max(4,Math.min(100,level*10));}
  daysRemaining(facility:YouthFacilityOption):number{if(!facility.upgrading)return 0;const elapsed=facility.startSeason<this.team.currentSeason?(365-facility.startDay)+this.team.currentDay:this.team.currentDay-facility.startDay;return Math.max(0,facility.durationDays-elapsed);}
  get positionEntries(){return Object.entries(this.data?.positionCoverage||{});}
  @HostListener('window:keydown',['$event']) shortcut(e:KeyboardEvent):void{if((e.target as HTMLElement)?.matches('input,select,textarea'))return;const key=e.key.toLowerCase();if(key==='i')document.querySelector('.investment-section')?.scrollIntoView({behavior:'smooth'});if(key==='r')this.rankingScope=this.rankingScope==='league'?'world':'league';if(key==='p')document.querySelector('.pipeline-section')?.scrollIntoView({behavior:'smooth'});if(key==='l')this.router.navigateByUrl('/academy3');if(key==='o')this.router.navigateByUrl('/youth-academy');}
}
