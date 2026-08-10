import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { urlApp } from '../app.component';

export interface ClubStaffScore { teamId:number; teamName:string; competitionId:number; overallScore:number; coachingScore:number; tacticalScore:number; fitnessScore:number; goalkeepingScore:number; youthScore:number; scoutingScore:number; depthScore:number; coachCount:number; scoutCount:number; weeklyWageBill:number; }
export interface RankedStaffClub { worldRank:number; leagueRank:number; club:ClubStaffScore; }
export interface StaffCandidate { kind:string; id:number; name:string; role:string; age:number; currentTeamId:number; currentTeamName:string; freeAgent:boolean; quality:number; specialtyRating:number; currentWage:number; wageDemand:number; contractEndSeason:number; requiredCompensation:number; attributes:{[key:string]:number}; }
export interface StaffIntelligence { teamId:number; season:number; ownClub:ClubStaffScore; benchmarks:any; ranking:RankedStaffClub[]; roleCoverage:{typeId:number;role:string;current:number;maximum:number;vacancies:number}[]; contractRisks:{kind:string;staffId:number;name:string;role:string;contractEndSeason:number;wage:number;quality:number}[]; market:StaffCandidate[]; }
export interface StaffOffer { kind:string; staffId:number; offeredWage:number; contractYears:number; compensation:number; }
export interface StaffOfferResult { success:boolean; message:string; requiredWage:number; requiredCompensation:number; staff?:StaffCandidate; }

@Injectable({providedIn:'root'})
export class StaffIntelligenceApi {
  constructor(private http:HttpClient){}
  intelligence(teamId:number):Observable<StaffIntelligence>{ return this.http.get<StaffIntelligence>(`${urlApp}/staff/intelligence/${teamId}`); }
  makeOffer(offer:StaffOffer):Observable<StaffOfferResult>{ return this.http.post<StaffOfferResult>(`${urlApp}/staff/offer`,offer); }
}
