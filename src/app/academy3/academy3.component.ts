import { Component, HostListener, OnInit } from '@angular/core';
import { AcademyIntelligenceService, AcademyOverview, AcademyProspect } from '../services/academy-intelligence.service';
import { TeamService } from '../services/team.service';
import { GameEventsService } from '../services/game-events.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';

@Component({selector:'app-academy3',templateUrl:'./academy3.component.html',styleUrls:['../academy-lab.css']})
export class Academy3Component implements OnInit {
  data?:AcademyOverview; loading=true; error=''; query=''; filter='ALL'; sort='POTENTIAL'; selected?:AcademyProspect; message=''; acting=false;
  constructor(private api:AcademyIntelligenceService,public team:TeamService,private events:GameEventsService,private feedback:UiFeedbackService=new UiFeedbackService()){}
  ngOnInit():void{this.load();}
  load():void{this.loading=true;this.api.overview(this.team.teamId).subscribe({next:data=>{this.data=data;const current=this.selected?data.prospects.find(p=>p.id===this.selected?.id):undefined;this.selected=current||this.prospects[0];this.loading=false;},error:()=>{this.error='Academy development data could not be loaded.';this.loading=false;}});}
  get prospects():AcademyProspect[]{let rows=[...(this.data?.prospects||[])];const q=this.query.trim().toLowerCase();if(q)rows=rows.filter(p=>`${p.name} ${p.position}`.toLowerCase().includes(q));if(this.filter!=='ALL')rows=rows.filter(p=>p.recommendation===this.filter);if(this.sort==='ABILITY')rows.sort((a,b)=>b.currentAbility-a.currentAbility);else if(this.sort==='READINESS')rows.sort((a,b)=>b.readinessPercent-a.readinessPercent);else if(this.sort==='AGE')rows.sort((a,b)=>a.age-b.age);else rows.sort((a,b)=>b.potentialAbility-a.potentialAbility);return rows;}
  select(player:AcademyProspect):void{this.selected=player;this.message='';}
  promote():void{if(!this.selected||this.acting)return;this.acting=true;this.api.promote(this.selected.id).subscribe({next:()=>{this.acting=false;this.message=`${this.selected?.name} was promoted to the first team.`;this.events.emit('squad','youth');this.selected=undefined;this.load();},error:()=>{this.acting=false;this.message='Promotion could not be completed.';}});}
  async release():Promise<void>{if(!this.selected||this.acting)return;const confirmed=await this.feedback.confirm(`Release ${this.selected.name} from the academy?`,{title:'Release prospect',confirmLabel:'Release',tone:'error'});if(!confirmed)return;this.acting=true;this.api.release(this.selected.id).subscribe({next:()=>{this.acting=false;this.message='Prospect released.';this.selected=undefined;this.load();},error:()=>{this.acting=false;this.message='Release could not be completed.';}});}
  money(value:number):string{return value>=1e6?`€${(value/1e6).toFixed(1)}m`:value>=1e3?`€${(value/1e3).toFixed(0)}k`:`€${value}`;}
  width(value:number):number{return Math.max(2,Math.min(100,value));}
  @HostListener('window:keydown',['$event']) shortcut(e:KeyboardEvent):void{if((e.target as HTMLElement)?.matches('input,select,textarea'))return;const key=e.key.toLowerCase();if(key==='f')document.querySelector<HTMLInputElement>('.prospect-search')?.focus();if(key==='a')this.filter='ALL';if(key==='h')this.filter='PRIORITY';if(key==='r')this.filter='READY';if(e.key==='Escape'){this.query='';this.filter='ALL';}}
}
