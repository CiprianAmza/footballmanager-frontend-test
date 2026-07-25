import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MultiplayerRoomService } from './multiplayer-room.service';

describe('MultiplayerRoomService', () => { it('is created', () => { TestBed.configureTestingModule({ imports: [HttpClientTestingModule] }); expect(TestBed.inject(MultiplayerRoomService)).toBeTruthy(); }); });
