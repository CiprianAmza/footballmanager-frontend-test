import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { EconomyDashboardComponent } from './economy-dashboard.component';
import { EconomyService } from '../services/economy.service';
import { CatalogItemView, PublicProfileView } from './economy.models';

describe('EconomyDashboardComponent', () => {
  let fixture: ComponentFixture<EconomyDashboardComponent>;
  let component: EconomyDashboardComponent;
  let economy: jasmine.SpyObj<EconomyService>;

  const profile: PublicProfileView = {
    profileId: 4, displayName: 'Chair Person', careerType: 'CHAIRMAN', controlType: 'USER',
    active: true, retired: false,
    wealth: {
      profileId: 4, cash: { amount: 1000000, currency: 'EUR', minorUnitScale: 0 },
      assetValue: { amount: 0, currency: 'EUR', minorUnitScale: 0 },
      investmentValue: { amount: 0, currency: 'EUR', minorUnitScale: 0 },
      clubEquityValue: { amount: 0, currency: 'EUR', minorUnitScale: 0 },
      netWorth: { amount: 1000000, currency: 'EUR', minorUnitScale: 0 },
      lifetimeCareerEarnings: { amount: 0, currency: 'EUR', minorUnitScale: 0 },
      realizedInvestmentGain: { amount: 0, currency: 'EUR', minorUnitScale: 0 }
    }
  };
  const item: CatalogItemView = {
    id: 8, code: 'APARTMENT_1_ROOM', type: 'APARTMENT', apartmentRooms: 1,
    name: 'One-room Apartment', iconKey: 'apartment-1',
    purchasePrice: { amount: 150000, currency: 'EUR', minorUnitScale: 0 }, resaleHaircutBps: 1000
  };

  beforeEach(async () => {
    economy = jasmine.createSpyObj<EconomyService>('EconomyService',
      ['myProfile', 'catalog', 'myAssets', 'myLedger', 'purchase', 'sell']);
    economy.myProfile.and.returnValue(of(profile));
    economy.catalog.and.returnValue(of([item]));
    economy.myAssets.and.returnValue(of([]));
    economy.myLedger.and.returnValue(of({ content: [], page: 0, size: 50, totalElements: 0, totalPages: 0 }));
    economy.purchase.and.returnValue(of({} as any));
    economy.sell.and.returnValue(of({} as any));
    await TestBed.configureTestingModule({
      imports: [FormsModule, RouterTestingModule],
      declarations: [EconomyDashboardComponent],
      providers: [{ provide: EconomyService, useValue: economy }]
    }).compileComponents();
    fixture = TestBed.createComponent(EconomyDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders exact server wealth components', () => {
    expect(component.profile?.wealth.netWorth.amount).toBe(1000000);
    expect(fixture.nativeElement.textContent).toContain('Net worth');
    expect(fixture.nativeElement.textContent).toContain('Career earnings');
  });

  it('purchases by catalog id without accepting owner or price input', () => {
    component.buy(item);
    expect(economy.purchase).toHaveBeenCalled();
    const args = economy.purchase.calls.mostRecent().args;
    expect(args[0]).toBe(8);
    expect(args[1]).toContain('ui-purchase-8-');
  });
});
