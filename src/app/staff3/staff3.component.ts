import { Component, HostListener, OnInit } from '@angular/core';
import { StaffCandidate, StaffIntelligence, StaffIntelligenceApi } from '../services/staff-intelligence.service';
import { TeamService } from '../services/team.service';

@Component({selector:'app-staff3',templateUrl:'./staff3.component.html',styleUrls:['../staff-lab.css']})
export class Staff3Component implements OnInit {
  data?:StaffIntelligence; loading=true; error=''; query=''; kind='ALL'; source='ALL'; role='ALL'; minQuality=0; sort='QUALITY'; selected?:StaffCandidate;
  offeredWage=0; compensation=0; contractYears=3; submitting=false; result=''; success=false;
  constructor(private api:StaffIntelligenceApi,public team:TeamService){}
  ngOnInit():void{this.reload();}
  reload():void{this.loading=true;this.error='';this.api.intelligence(this.team.teamId).subscribe({next:data=>{this.data=data;const first=this.candidates[0];this.selected=first;if(first){this.offeredWage=first.wageDemand;this.compensation=first.requiredCompensation;}this.loading=false;},error:()=>{this.error='The staff market could not be loaded.';this.loading=false;}});}
  get roles():string[]{return [...new Set((this.data?.market||[]).map(row=>row.role))].sort();}
  get candidates():StaffCandidate[]{let rows=[...(this.data?.market||[])];const q=this.query.trim().toLowerCase();if(q)rows=rows.filter(r=>`${r.name} ${r.role} ${r.currentTeamName}`.toLowerCase().includes(q));if(this.kind!=='ALL')rows=rows.filter(r=>r.kind===this.kind);if(this.source==='FREE')rows=rows.filter(r=>r.freeAgent);if(this.source==='EMPLOYED')rows=rows.filter(r=>!r.freeAgent);if(this.role!=='ALL')rows=rows.filter(r=>r.role===this.role);rows=rows.filter(r=>r.quality>=this.minQuality);if(this.sort==='WAGE')rows.sort((a,b)=>a.wageDemand-b.wageDemand);else if(this.sort==='COMP')rows.sort((a,b)=>a.requiredCompensation-b.requiredCompensation);else rows.sort((a,b)=>b.quality-a.quality);return rows;}
  select(row:StaffCandidate):void{this.selected=row;this.offeredWage=row.wageDemand;this.compensation=row.requiredCompensation;this.contractYears=3;this.result='';}
  offer():void{if(!this.selected)return;this.submitting=true;this.api.makeOffer({kind:this.selected.kind,staffId:this.selected.id,offeredWage:this.offeredWage,contractYears:this.contractYears,compensation:this.compensation}).subscribe({next:res=>{this.submitting=false;this.result=res.message;this.success=res.success;if(res.success)this.reload();else{this.offeredWage=Math.max(this.offeredWage,res.requiredWage||0);this.compensation=Math.max(this.compensation,res.requiredCompensation||0);}},error:()=>{this.submitting=false;this.success=false;this.result='The offer could not be submitted.';}});}
  money(value:number):string{return value>=1e6?`€${(value/1e6).toFixed(1)}m`:value>=1e3?`€${(value/1e3).toFixed(0)}k`:`€${value}`;}
  entries(row:StaffCandidate){return Object.entries(row.attributes).sort((a,b)=>b[1]-a[1]);}
  @HostListener('window:keydown',['$event']) shortcut(e:KeyboardEvent):void{if((e.target as HTMLElement)?.tagName==='INPUT')return;const k=e.key.toLowerCase();if(k==='f')this.source='FREE';if(k==='e')this.source='EMPLOYED';if(k==='c')this.kind='COACH';if(k==='s')this.kind='SCOUT';if(e.key==='Escape'){this.kind='ALL';this.source='ALL';this.role='ALL';this.minQuality=0;}}
}
