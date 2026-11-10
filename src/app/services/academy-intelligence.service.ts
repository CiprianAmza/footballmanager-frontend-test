import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlApp } from '../app.component';

export interface AcademyPipeline { active:number; ready:number; elitePotential:number; averageAbility:number; averagePotential:number; graduates:number; graduatesFromCurrentIntake:number; released:number; }
export interface AcademyProspect { id:number; name:string; age:number; position:string; currentAbility:number; potentialAbility:number; readinessPercent:number; developmentGap:number; potentialBand:string; daysInAcademy:number; seasonJoined:number; projectedWage:number; estimatedValue:number; recommendation:string; }
export interface YouthFacilityOption { type:string; name:string; description:string; currentLevel:number; maxLevel:number; canUpgrade:boolean; upgradeCost:number; upgradeDuration:number; upgrading:boolean; targetLevel:number; startDay:number; startSeason:number; durationDays:number; }
export interface AcademyRank { teamId:number; teamName:string; competitionId:number; worldRank:number; leagueRank:number; academyLevel:number; trainingLevel:number; hoydQuality:number; activeProspects:number; graduates:number; score:number; }
export interface AcademyOverview { teamId:number; teamName:string; season:number; currentDay:number; nextReportDay:number|null; clubFinances:number; academyLevel:number; trainingLevel:number; hoydQuality:number; leagueRank:number; worldRank:number; pipeline:AcademyPipeline; prospects:AcademyProspect[]; positionCoverage:{[key:string]:number}; facilities:YouthFacilityOption[]; ranking:AcademyRank[]; }

@Injectable({providedIn:'root'})
export class AcademyIntelligenceService {
  constructor(private http:HttpClient) {}
  overview(teamId:number,includeRanking=true):Observable<AcademyOverview>{return this.http.get<AcademyOverview>(`${urlApp}/game/youthAcademy/intelligence/${teamId}`,{params:{includeRanking}});}
  upgrade(facilityType:string):Observable<any>{return this.http.post(`${urlApp}/game/youthAcademy/facilities/upgrade`,{facilityType});}
  promote(playerId:number):Observable<any>{return this.http.post(`${urlApp}/game/youthAcademy/promote/${playerId}`,{});}
  release(playerId:number):Observable<void>{return this.http.post<void>(`${urlApp}/game/youthAcademy/release/${playerId}`,{});}
}
