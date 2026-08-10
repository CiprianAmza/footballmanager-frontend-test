import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

import { GameEventsService } from '../services/game-events.service';
import { TeamService } from '../services/team.service';
import { TransferOffer, TransferService } from '../services/transfer.service';
import { TransferPageComponent } from './transfer-page.component';
import { of, throwError } from 'rxjs';

describe('TransferPageComponent incoming offer groups', () => {
  let component: TransferPageComponent;

  beforeEach(() => {
    component = new TransferPageComponent(
      {} as HttpClient,
      {} as ActivatedRoute,
      {} as Router,
      {} as TransferService,
      {} as TeamService,
      {} as GameEventsService,
      { save: () => {} } as any
    );
  });

  it('groups all club offers beneath one player and orders them by amount', () => {
    component.incomingOffers = [
      offer(1, 10, 'Player A', 'Club One', 20_000_000),
      offer(2, 10, 'Player A', 'Club Two', 35_000_000),
      offer(3, 11, 'Player B', 'Club Three', 15_000_000)
    ];

    expect(component.incomingOfferGroups.length).toBe(2);
    expect(component.incomingOfferGroups[0].player.playerName).toBe('Player A');
    expect(component.incomingOfferGroups[0].offers.map(item => item.offerAmount))
      .toEqual([35_000_000, 20_000_000]);
    expect(component.incomingOfferGroups[1].offers.length).toBe(1);
  });

  it('shows the backend conflict and reloads after a stale offer response', () => {
    const transferService = jasmine.createSpyObj<TransferService>(
      'TransferService', ['respondToOffer', 'getIncomingOffers']);
    transferService.respondToOffer.and.returnValue(
      throwError(() => ({ error: 'The player has already left the selling club' })));
    transferService.getIncomingOffers.and.returnValue(of([]));
    component = new TransferPageComponent(
      {} as HttpClient,
      {} as ActivatedRoute,
      {} as Router,
      transferService,
      {} as TeamService,
      {} as GameEventsService,
      { save: () => {} } as any
    );
    component.teamId = 9;

    component.respondToOffer(141, 'accept');

    expect(component.errorMessage).toBe('The player has already left the selling club');
    expect(component.incomingOffers).toEqual([]);
    expect(transferService.getIncomingOffers).toHaveBeenCalledWith(9);
  });

  it('sorts text columns ascending first and toggles the active column', () => {
    spyOn(component, 'loadMarket');

    component.toggleSort('club');
    expect(component.sortField).toBe('club');
    expect(component.sortDirection).toBe('asc');
    expect(component.marketPage).toBe(0);

    component.toggleSort('club');
    expect(component.sortDirection).toBe('desc');
    expect(component.loadMarket).toHaveBeenCalledTimes(2);
  });

  it('exposes badges through the shared transfer tabs model', () => {
    component.incomingOffers = [offer(1, 10, 'Player A', 'Club One', 20_000_000)];
    component.loansIn = [{} as any];

    expect(component.transferTabs.find(tab => tab.id === 'incoming')?.badge).toBe(1);
    expect(component.transferTabs.find(tab => tab.id === 'loans')?.badge).toBe(1);
  });

  it('keeps only one contextual action menu open and closes it when changing tabs', () => {
    const event = new MouseEvent('click');
    spyOn(event, 'stopPropagation');
    spyOn(component, 'loadTabData');

    component.toggleActionMenu('market-12', event);
    expect(component.isActionMenuOpen('market-12')).toBeTrue();
    expect(event.stopPropagation).toHaveBeenCalled();

    component.toggleActionMenu('market-20', event);
    expect(component.isActionMenuOpen('market-12')).toBeFalse();
    expect(component.isActionMenuOpen('market-20')).toBeTrue();

    component.switchTab('incoming');
    expect(component.openActionMenu).toBeNull();
    expect(component.activeTab).toBe('incoming');
  });

  function offer(id: number, playerId: number, playerName: string,
                 fromTeamName: string, offerAmount: number): TransferOffer {
    return {
      id, playerId, playerName, fromTeamId: id + 100, fromTeamName,
      toTeamId: 9, toTeamName: 'Human Team', offerAmount, askingPrice: offerAmount,
      status: 'pending', seasonNumber: 4, direction: 'incoming', createdAt: ''
    };
  }
});
