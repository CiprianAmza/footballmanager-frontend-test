import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { StaffIntelligence, StaffIntelligenceApi } from '../services/staff-intelligence.service';
import { TeamService } from '../services/team.service';

@Component({selector:'app-staff2',templateUrl:'./staff2.component.html',styleUrls:['../staff-lab.css']})
export class Staff2Component implements OnInit {
  data?:StaffIntelligence; loading=true; error=''; rankingScope:'league'|'world'='league';
  constructor(private api:StaffIntelligenceApi,public team:TeamService,private router:Router){}
  ngOnInit():void{this.load();}
  load():void{this.loading=true;this.api.intelligence(this.team.teamId).subscribe({next:data=>{this.data=data;this.loading=false;},error:()=>{this.error='Staff intelligence could not be loaded.';this.loading=false;}});}
  get ranking(){const rows=this.data?.ranking||[];return this.rankingScope==='league'?rows.filter(row=>row.leagueRank>0).sort((a,b)=>a.leagueRank-b.leagueRank):rows;}
  get ownRank():number{return this.data?.ranking.find(row=>row.club.teamId===this.team.teamId)?.leagueRank||0;}
  get totalVacancies():number{return (this.data?.roleCoverage||[]).reduce((total,role)=>total+role.vacancies,0);}
  money(value:number):string{return value>=1e6?`€${(value/1e6).toFixed(1)}m`:value>=1e3?`€${(value/1e3).toFixed(0)}k`:`€${value}`;}
  departmentRows():any[]{if(!this.data)return[];const own=this.data.ownClub,b=this.data.benchmarks;return[{name:'Coaching',value:own.coachingScore,avg:b.coachingAverage},{name:'Tactical',value:own.tacticalScore,avg:b.coachingAverage},{name:'Fitness',value:own.fitnessScore,avg:b.fitnessAverage},{name:'Goalkeeping',value:own.goalkeepingScore,avg:b.goalkeepingAverage},{name:'Youth',value:own.youthScore,avg:b.youthAverage},{name:'Scouting',value:own.scoutingScore,avg:b.scoutingAverage}];}
  width(value:number):number{return Math.max(2,Math.min(100,value/20*100));}
  @HostListener('window:keydown',['$event']) shortcut(e:KeyboardEvent):void{if((e.target as HTMLElement)?.tagName==='INPUT')return;const k=e.key.toLowerCase();if(k==='m')this.router.navigateByUrl('/staff3');if(k==='o')this.router.navigateByUrl('/staff');if(k==='r')this.rankingScope=this.rankingScope==='league'?'world':'league';if(k==='c')document.querySelector('.contract-section')?.scrollIntoView({behavior:'smooth'});}
}
