import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone,
  OnChanges, OnDestroy, Output, SimpleChanges, ViewChild
} from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { KitColors, PitchClip, PitchFrame } from '../models/live-match.model';
import {
  FaceDescriptor, SpriteAppearance, SpriteHairStyle, spriteAppearance
} from './appearance';
import { kitColor, PitchMarker } from './match-pitch.component';
import { playBoo, playCheer, playGroan } from './match-sound';

/**
 * Faza D (MVP): Three.js renderer for the match pitch. Drop-in sibling of
 * `<app-match-pitch>` — same inputs, same output, same public playback API
 * (advance / skip / replay / stop / firstClipFrame / lastRenderedFrame /
 * renderFrame), consuming the same renderer-neutral `PitchFrame` model, so
 * `<app-live-match>` drives either renderer through one code path.
 *
 * MVP scope: textured pitch plane, goal frames, kit-coloured capsule players
 * with number billboards, ball, officials (Faza B), a gently ball-tracking
 * broadcast camera, and an HTML overlay for clip event text. GLTF characters,
 * stadium and replay cameras are the later Faza D steps.
 */
@Component({
  selector: 'app-match-pitch-3d',
  template: `
    <div #host class="mp3d-host" [class.mp3d-fill]="responsive">
      <div class="mp3d-event" *ngIf="eventText">{{ eventText }}</div>
    </div>
  `,
  styles: [`
    .mp3d-host {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #222;
      margin-bottom: 12px;
      background: #0a0e14;
      aspect-ratio: 1.6;
    }
    .mp3d-fill {
      margin-bottom: 0;
      /* Fill whatever the modal's flex chain grants; if that collapses (e.g.
         during layout) the aspect ratio keeps a visible, sane pane. */
      flex: 1;
      min-height: 240px;
      aspect-ratio: 1.6;
      max-height: 100%;
    }
    .mp3d-host canvas { display: block; width: 100%; height: 100%; }
    .mp3d-event {
      position: absolute;
      top: 10%;
      left: 0; right: 0;
      text-align: center;
      font: bold 28px sans-serif;
      color: #fff;
      text-shadow: 0 2px 8px rgba(0,0,0,0.8);
      pointer-events: none;
    }
  `]
})
export class MatchPitch3dComponent implements AfterViewInit, OnChanges, OnDestroy {

  @Input() clip: PitchClip | null = null;
  /** Backend face descriptors keyed by playerId; null until the payload lands.
   *  Figures resolve through the SAME module as the cards, so pitch and card
   *  agree whenever a descriptor exists (hash fallback otherwise). */
  @Input() faces: { [playerId: number]: FaceDescriptor } | null = null;
  @Input() homeTeamId = 0;
  @Input() homeKit: KitColors | null = null;
  @Input() awayKit: KitColors | null = null;
  @Input() responsive = false;

  @Output() clipFinished = new EventEmitter<void>();

  @ViewChild('host') hostRef!: ElementRef<HTMLDivElement>;

  eventText = '';

  // ---- three.js scene ----
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1.6, 0.1, 500);
  private playerMeshes = new Map<number, THREE.Group>();
  private officialMeshes: THREE.Group[] = [];
  private ballMesh: THREE.Mesh | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private numberTextures = new Map<string, THREE.Texture>();
  private labelTextures = new Map<string, THREE.Texture>();
  /** Surnames by playerId, merged from ambient renderFrame calls + clip rosters. */
  private namesById: { [playerId: number]: string } = {};
  // Figure caches: plain-colour materials are shared across every body part
  // that uses the same hex; patterned torso materials/textures are keyed by
  // pattern+colours so a whole team reuses one material instead of 11.
  private plainMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private torsoMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private kitTextures = new Map<string, THREE.Texture>();
  private figureGeo: {
    /** Calf segment, painted in the kit sock colour (jambiera). */
    sock: THREE.BufferGeometry;
    thigh: THREE.BufferGeometry;
    boot: THREE.BoxGeometry;
    shorts: THREE.CylinderGeometry;
    /** Lathe-turned human silhouette: hips → waist → chest → shoulders → neck. */
    torso: THREE.BufferGeometry;
    upperArm: THREE.BufferGeometry;
    forearm: THREE.BufferGeometry;
    hand: THREE.SphereGeometry;
    neck: THREE.CylinderGeometry;
    head: THREE.SphereGeometry;
    hair: Record<SpriteHairStyle, THREE.BufferGeometry | null>;
    /** Second geometry of the 'bun' composite (cap + knot). */
    bunKnot: THREE.SphereGeometry;
  } | null = null;
  private cameraTargetX = 0;
  private cameraTargetZ = 0;
  /** Eased camera zoom, driven by the frame zoom hint (-1 wide … 1 tight). */
  private cameraZoom = 0;
  private standsGroup: THREE.Group | null = null;
  private ballShadow: THREE.Mesh | null = null;
  private shadowGeometry: THREE.CircleGeometry | null = null;
  private shadowMaterial: THREE.MeshBasicMaterial | null = null;

  // ---- playback state (mirrors <app-match-pitch>) ----
  private clipElapsedMs = 0;
  private steppedFrame = -1;
  private finishedEmitted = false;
  private eventTextTimer: any = null;
  private lastFrame: PitchFrame | null = null;

  // ---- gestures: short authored animations triggered by clip events (kick,
  // keeper dive, stepover, cuts, roulette, rabona), keyed by playerId ----
  private gestures = new Map<number, {
    kind: 'kick' | 'dive' | 'stepover' | 'cut' | 'roulette' | 'rabona';
    start: number; until: number; sign: number;
  }>();

  // ---- experimental GLTF figures (localStorage fm_figures3d = 'gltf'):
  // a rigged character with real skeletal Idle/Run animations, team-tinted.
  // Loses kits/faces/boots — an evaluation mode, not the default. ----
  private readonly gltfFigures = localStorage.getItem('fm_figures3d') === 'gltf';
  private characterTemplate: THREE.Group | null = null;
  private characterClips: THREE.AnimationClip[] = [];
  private lastMixerMs = 0;

  /** World scale: pitch x 0-100 → world X -50..50; y 0-100 → world Z -32..32. */
  private static readonly Z_SCALE = 0.64;

  private static readonly KIT_PATTERNS = ['plain', 'stripes', 'hoops', 'sash'];

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => this.initScene());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['clip']) this.resetPlayback();
    if (changes['homeKit'] || changes['awayKit'] || changes['faces']) {
      // Kit OR face-data change invalidates every baked mesh colour — without
      // the faces branch, meshes built before the descriptors arrived would
      // keep their hash-fallback look for the rest of the match.
      this.playerMeshes.forEach(mesh => this.scene.remove(mesh));
      this.playerMeshes.clear();
      // Stands carry seat blocks in the team colours (kit-only concern).
      if ((changes['homeKit'] || changes['awayKit']) && this.renderer) {
        this.buildStands();
      }
    }
  }

  ngOnDestroy(): void {
    this.stop();
    this.resizeObserver?.disconnect();
    this.renderer?.dispose();
    this.numberTextures.forEach(texture => texture.dispose());
    this.labelTextures.forEach(texture => texture.dispose());
    this.kitTextures.forEach(texture => texture.dispose());
    this.plainMaterials.forEach(material => material.dispose());
    this.torsoMaterials.forEach(material => material.dispose());
    this.shadowGeometry?.dispose();
    this.shadowMaterial?.dispose();
    if (this.figureGeo) {
      const geo = this.figureGeo;
      [geo.sock, geo.thigh, geo.boot, geo.shorts, geo.torso, geo.upperArm,
       geo.forearm, geo.hand, geo.neck, geo.head, geo.bunKnot]
        .forEach(geometry => geometry.dispose());
      Object.keys(geo.hair).forEach(
        style => geo.hair[style as SpriteHairStyle]?.dispose());
    }
  }

  // ---------- public playback API (parity with MatchPitchComponent) ----------

  advance(dtMs: number): void {
    if (!this.clip || !this.renderer || this.finishedEmitted) return;
    this.clipElapsedMs += dtMs;
    const totalFrames = this.clip.totalFrames || 150;
    const exact = (this.clipElapsedMs * 30) / 1000;

    const target = Math.min(Math.floor(exact), totalFrames);
    while (this.steppedFrame < target) {
      this.steppedFrame++;
      this.stepFrame(this.steppedFrame);
    }

    if (exact > totalFrames) {
      this.finishedEmitted = true;
      this.drawClipFrame(totalFrames);
      this.zone.run(() => this.clipFinished.emit());
      return;
    }
    this.drawClipFrame(Math.min(exact, totalFrames));
  }

  skip(): void {
    if (!this.clip) return;
    const totalFrames = this.clip.totalFrames || 150;
    this.clipElapsedMs = (totalFrames * 1000) / 30;
    this.steppedFrame = totalFrames;
    this.finishedEmitted = true;
    const outcome = this.clip.outcome;
    this.setEventText(outcome === 'SAVE' ? 'SAVED!'
      : outcome === 'MISS' ? 'MISSED!'
      : outcome === 'BLOCKED' ? 'BLOCKED!'
      : outcome === 'GOAL' ? 'GOAL!' : '');
    this.drawClipFrame(totalFrames);
    this.zone.run(() => this.clipFinished.emit());
  }

  firstClipFrame(): PitchFrame | null {
    return this.clip?.frames?.[0] ?? null;
  }

  lastRenderedFrame(): PitchFrame | null {
    return this.lastFrame;
  }

  replay(): void {
    if (!this.clip) return;
    this.resetPlayback();
    this.drawClipFrame(0);
  }

  stop(): void {
    if (this.eventTextTimer) { clearTimeout(this.eventTextTimer); this.eventTextTimer = null; }
    this.finishedEmitted = true;
  }

  /** Persistent-pane entry point: paint an arbitrary frame (ambient/splices).
   *  Markers are accepted for API parity; the 3D pane skips them in the MVP. */
  renderFrame(frame: PitchFrame,
              names: { [playerId: number]: string } = {},
              _markers: PitchMarker[] = []): void {
    Object.assign(this.namesById, names);
    this.paint(frame);
  }

  // ---------- internals ----------

  private resetPlayback(): void {
    this.clipElapsedMs = 0;
    this.steppedFrame = -1;
    this.finishedEmitted = false;
    this.setEventText('');
    this.gestures.clear();
    // Clip rosters carry surnames — fold them into the shared name map so the
    // overhead labels show names during clips too.
    if (this.clip?.names) Object.assign(this.namesById, this.clip.names);
  }

  private stepFrame(index: number): void {
    const event = (this.clip?.events || []).find(e => e.frame === index);
    if (!event) return;
    this.setEventText(this.labelFor(event.type));
    if (event.type === 'GOAL') {
      const homeGoal = !this.clip?.shooterTeamId
        || Number(this.clip.shooterTeamId) === Number(this.homeTeamId);
      if (homeGoal) playCheer();
      else { playGroan(); playBoo(); }
    } else if (event.type === 'SAVE' || event.type === 'MISS' || event.type === 'BLOCKED') {
      playGroan();
    }

    // Gesture triggers for the procedural figures.
    if (event.fromPlayerId) {
      const now = performance.now();
      const trigger = (kind: 'kick' | 'dive' | 'stepover' | 'cut' | 'roulette' | 'rabona',
                       durationMs: number, sign = 1) =>
        this.gestures.set(event.fromPlayerId,
          { kind, start: now, until: now + durationMs, sign });
      switch (event.type) {
        case 'PASS': trigger('kick', 320); break;
        case 'SHOT': case 'GOAL': trigger('kick', 420); break;
        case 'SAVE': trigger('dive', 650, index % 2 === 0 ? 1 : -1); break;
        case 'STEPOVER': trigger('stepover', 520); break;
        case 'CUT_LEFT': trigger('cut', 380, -1); break;
        case 'CUT_RIGHT': trigger('cut', 380, 1); break;
        case 'ROULETTE': trigger('roulette', 680); break;
        case 'RABONA': trigger('rabona', 520); break;
      }
    }
  }

  private labelFor(type: string): string {
    const labels: { [key: string]: string } = {
      PASS: '', SHOT: 'SHOT!', GOAL: 'GOAL!', SAVE: 'SAVED!',
      MISS: 'MISSED!', BLOCKED: 'BLOCKED!', BLOCK: 'BLOCKED!',
      RABONA: 'RABONA!', RABONA_CROSS: 'RABONA!', ADVANTAGE: 'Advantage!'
    };
    return labels[type] ?? '';
  }

  /** Persistent-world action: text, crowd sound and gesture for the moment.
   *  Mirrors the clip-event path so both feeds drive identical presentation. */
  notifyAction(event: { type: string; playerId: number; targetPlayerId: number; teamId: number },
               isHomeTeam: boolean): void {
    this.setEventText(this.labelFor(event.type));
    if (event.type === 'GOAL') {
      if (isHomeTeam) playCheer(); else { playGroan(); playBoo(); }
    } else if (event.type === 'SAVE' || event.type === 'MISS' || event.type === 'BLOCK') {
      playGroan();
    }
    if (!event.playerId) return;
    const now = performance.now();
    const trigger = (kind: 'kick' | 'dive' | 'stepover' | 'cut' | 'roulette' | 'rabona',
                     durationMs: number, sign = 1) =>
      this.gestures.set(event.playerId, { kind, start: now, until: now + durationMs, sign });
    switch (event.type) {
      // The kick pose fires on STRIKE (actual boot-to-ball contact from the
      // world), not when the pass is merely decided.
      case 'STRIKE': trigger('kick', 380); break;
      case 'SAVE': trigger('dive', 650, event.playerId % 2 === 0 ? 1 : -1); break;
      case 'STEPOVER': trigger('stepover', 520); break;
      case 'CUT_LEFT': trigger('cut', 380, -1); break;
      case 'CUT_RIGHT': trigger('cut', 380, 1); break;
      case 'ROULETTE': trigger('roulette', 680); break;
      case 'RABONA': case 'RABONA_CROSS': trigger('rabona', 520); break;
    }
  }

  private setEventText(text: string): void {
    this.zone.run(() => this.eventText = text);
    if (this.eventTextTimer) clearTimeout(this.eventTextTimer);
    if (text) {
      this.eventTextTimer = setTimeout(
        () => this.zone.run(() => this.eventText = ''), 1600);
    }
  }

  private drawClipFrame(exact: number): void {
    const frame = this.frameAt(exact);
    if (frame) this.paint(frame);
  }

  /** Same interpolation contract as the 2D renderer. */
  private frameAt(exact: number): PitchFrame | null {
    const frames = this.clip?.frames;
    if (!frames || frames.length === 0) return null;
    const clamped = Math.max(0, Math.min(exact, frames.length - 1));
    const low = Math.floor(clamped);
    const high = Math.min(low + 1, frames.length - 1);
    const t = clamped - low;
    const a = frames[low];
    if (t <= 0 || low === high) return a;
    const b = frames[high];
    const lerp = (from: number, to: number) =>
      isFinite(from) && isFinite(to) ? from + (to - from) * t : from;
    return {
      ball: {
        x: lerp(a.ball.x, b.ball.x),
        y: lerp(a.ball.y, b.ball.y),
        h: lerp(a.ball.h || 0, b.ball.h || 0),
        carrierPlayerId: a.ball.carrierPlayerId
      },
      zoom: a.zoom,
      players: a.players.map((player, index) => {
        const next = b.players[index];
        if (!next || next.playerId !== player.playerId) return player;
        return { ...player, x: lerp(player.x, next.x), y: lerp(player.y, next.y) };
      }),
      officials: a.officials?.map((official, index) => {
        const next = b.officials?.[index];
        if (!next) return official;
        return { ...official, x: lerp(official.x, next.x), y: lerp(official.y, next.y) };
      })
    };
  }

  private initScene(): void {
    const host = this.hostRef?.nativeElement;
    if (!host) return;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Inline styles: Angular's emulated view encapsulation cannot reach an
    // element three.js creates at runtime, so scoped CSS never applies here.
    const dom = this.renderer.domElement;
    dom.style.display = 'block';
    dom.style.width = '100%';
    dom.style.height = '100%';
    host.appendChild(dom);

    // Night-match ambience: dark neutral surroundings, gentle fog for depth,
    // one strong floodlight key + a soft fill.
    this.scene.background = new THREE.Color(0x0a0e14);
    this.scene.fog = new THREE.Fog(0x0a0e14, 100, 240);
    this.scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x14361c, 0.7));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.4);
    key.position.set(40, 90, 25);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.4);
    fill.position.set(-45, 60, -30);
    this.scene.add(fill);

    this.buildPitch();
    this.buildAdBoards();
    this.buildGoals();
    this.buildCornerFlags();
    this.buildStands();

    // Experimental skeletal figures: load once, then rebuild player meshes
    // lazily so they re-enter as animated characters.
    if (this.gltfFigures) {
      new GLTFLoader().load('assets/models/Soldier.glb', gltf => {
        this.characterTemplate = gltf.scene;
        this.characterClips = gltf.animations || [];
        this.playerMeshes.forEach(mesh => this.scene.remove(mesh));
        this.playerMeshes.clear();
      });
    }
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 20, 20),
      new THREE.MeshStandardMaterial({ map: this.ballTexture() }));
    this.scene.add(this.ballMesh);
    this.ballShadow = new THREE.Mesh(this.shadowGeo(), this.shadowMat());
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.scale.setScalar(0.35);
    this.scene.add(this.ballShadow);

    this.camera.position.set(0, 32, 58);
    this.camera.lookAt(0, 0, -2);

    this.syncSize();
    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(host);

    if (this.lastFrame) this.paint(this.lastFrame);
  }

  private syncSize(): void {
    const host = this.hostRef?.nativeElement;
    if (!host || !this.renderer) return;
    const width = host.clientWidth || 640;
    const height = host.clientHeight || Math.round(width / 1.6);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    if (this.lastFrame) this.paint(this.lastFrame);
  }

  /** Grass plane with procedurally drawn markings, as a canvas texture.
   *  Natural desaturated greens, per-pixel speckle, thin lines, penalty arcs —
   *  the details that separate "broadcast turf" from "toy diorama". */
  private buildPitch(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 2048; canvas.height = 1312;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width, h = canvas.height;
    // Mowing stripes: two close natural greens, not saturated arcade tones.
    const stripes = 14;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#33763b' : '#3a8143';
      ctx.fillRect((w / stripes) * i, 0, w / stripes + 1, h);
    }
    // Grass speckle: subtle per-pixel noise so the turf has grain.
    for (let i = 0; i < 24000; i++) {
      ctx.fillStyle = Math.random() < 0.5
        ? 'rgba(20, 50, 24, 0.16)' : 'rgba(120, 190, 120, 0.10)';
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.strokeStyle = 'rgba(245, 245, 245, 0.85)';
    ctx.lineWidth = 4;
    const px = (x: number) => (x / 100) * w;
    const py = (y: number) => (y / 100) * h;
    ctx.strokeRect(px(1), py(1.5), px(98), py(97));
    ctx.beginPath(); ctx.moveTo(px(50), py(1.5)); ctx.lineTo(px(50), py(98.5)); ctx.stroke();
    ctx.beginPath(); ctx.arc(px(50), py(50), px(9), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(px(50), py(50), 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(245,245,245,0.85)'; ctx.fill();
    // Penalty + goal boxes, spots and the penalty arc ("D") both ends.
    for (const left of [true, false]) {
      const bx = (v: number) => left ? px(v) : w - px(v);
      ctx.strokeRect(Math.min(bx(1), bx(17)), py(24), Math.abs(bx(17) - bx(1)), py(52));
      ctx.strokeRect(Math.min(bx(1), bx(7)), py(37), Math.abs(bx(7) - bx(1)), py(26));
      ctx.beginPath(); ctx.arc(bx(12), py(50), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      if (left) ctx.arc(bx(12), py(50), px(9), -Math.PI * 0.29, Math.PI * 0.29);
      else ctx.arc(bx(12), py(50), px(9), Math.PI * 0.71, Math.PI * 1.29);
      ctx.stroke();
    }
    // Corner arcs at the four corners of the play area.
    for (const cx of [px(1), w - px(1)]) {
      for (const cy of [py(1.5), h - py(1.5)]) {
        ctx.beginPath(); ctx.arc(cx, cy, px(1.4), 0, Math.PI * 2); ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(104, 68),
      new THREE.MeshStandardMaterial({ map: texture }));
    plane.rotation.x = -Math.PI / 2;
    this.scene.add(plane);

    // Surrounding apron so the pitch doesn't float in a void.
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 170),
      new THREE.MeshStandardMaterial({ color: 0x1a2e20 }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.05;
    this.scene.add(apron);
  }

  /** Perimeter LED ad boards — a strong broadcast-realism cue. Neutral
   *  sponsor-less colour blocks; no real brands. */
  private buildAdBoards(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const blocks = ['#12406e', '#701d1d', '#0e5e46', '#5d4a10', '#232a36', '#3c1f5e'];
    let x = 0;
    let i = 0;
    while (x < canvas.width) {
      const bw = 90 + (i * 37) % 60;
      ctx.fillStyle = blocks[i % blocks.length];
      ctx.fillRect(x, 0, bw, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(x + 14, 12, bw - 28, 7);
      x += bw; i++;
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    const material = new THREE.MeshBasicMaterial({ map: texture });

    const board = (width: number, x: number, z: number, rotY: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.1), material);
      mesh.position.set(x, 0.55, z);
      mesh.rotation.y = rotY;
      // Slight backward lean, like real perimeter boards.
      mesh.rotateX(-0.12);
      this.scene.add(mesh);
    };
    board(110, 0, 35.5, 0);
    board(110, 0, -35.5, Math.PI);
    board(72, -54.5, 0, Math.PI / 2);
    board(72, 54.5, 0, -Math.PI / 2);
  }

  private buildGoals(): void {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const netMaterial = new THREE.MeshBasicMaterial({
      map: this.netTexture(), transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthWrite: false
    });
    // Real-world ratios (1 unit ≈ 1.05 m): goal 2.35 high × 7.0 wide — the
    // crossbar must clear every head, or the whole scene reads as a toy.
    for (const sign of [-1, 1]) {
      const goal = new THREE.Group();
      const postGeometry = new THREE.CylinderGeometry(0.09, 0.09, 2.35, 8);
      for (const z of [-3.5, 3.5]) {
        const post = new THREE.Mesh(postGeometry, material);
        post.position.set(0, 1.175, z);
        goal.add(post);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 7.0, 8), material);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(0, 2.35, 0);
      goal.add(bar);

      // Net: back wall + roof + two side panels, hanging behind the line.
      const back = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 2.35), netMaterial);
      back.rotation.y = Math.PI / 2;
      back.position.set(sign * 1.2, 1.175, 0);
      goal.add(back);
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 7.0), netMaterial);
      roof.rotation.x = Math.PI / 2;
      roof.rotation.z = Math.PI / 2;
      roof.position.set(sign * 0.6, 2.32, 0);
      goal.add(roof);
      for (const z of [-3.5, 3.5]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.35), netMaterial);
        side.position.set(sign * 0.6, 1.175, z);
        goal.add(side);
      }

      goal.position.set(sign * 50, 0, 0);
      this.scene.add(goal);
    }
  }

  /** Transparent grid texture the goal nets are woven from. */
  private netTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 64; i += 8) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 2);
    return texture;
  }

  /** Yellow corner flags at the four corners of the play area. */
  private buildCornerFlags(): void {
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd });
    const flagMaterial = new THREE.MeshBasicMaterial({
      color: 0xf6c945, side: THREE.DoubleSide });
    for (const x of [-50, 50]) {
      for (const z of [-32, 32]) {
        const group = new THREE.Group();
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), poleMaterial);
        pole.position.y = 0.75;
        group.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.38), flagMaterial);
        flag.position.set(0.28 * (x < 0 ? 1 : -1), 1.3, 0);
        group.add(flag);
        group.position.set(x, 0, z);
        this.scene.add(group);
      }
    }
  }

  /** Four raked stands around the pitch, seats speckled in the team colours.
   *  Each stand "looks at" a point above the centre spot, which both faces it
   *  toward the pitch and leans its top backward like real seating tiers. */
  private buildStands(): void {
    if (this.standsGroup) {
      this.scene.remove(this.standsGroup);
    }
    this.standsGroup = new THREE.Group();
    const home = kitColor(this.homeKit?.outfieldPrimary, '#3498db');
    const away = kitColor(this.awayKit?.outfieldPrimary, '#e74c3c');
    const texture = new THREE.CanvasTexture(this.crowdCanvas(home, away));
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture });

    const place = (width: number, x: number, z: number) => {
      const stand = new THREE.Mesh(new THREE.PlaneGeometry(width, 14), material);
      stand.position.set(x, 5.5, z);
      stand.lookAt(x * 0.1, 13, z * 0.1);
      this.standsGroup!.add(stand);
    };
    place(118, 0, -41);
    place(118, 0, 41);
    place(76, -59, 0);
    place(76, 59, 0);
    this.scene.add(this.standsGroup);
  }

  /** Crowd texture: dense jittered supporter dots in team colours + neutrals,
   *  over a dark tier, with a facade/walkway strip at the stand's base. */
  private crowdCanvas(home: string, away: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1c1f26';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const palette = [home, home, away, away, '#8a8f99', '#565b66', '#d8dbe0', '#3a3f49'];
    for (let row = 6; row < canvas.height - 22; row += 5) {
      for (let col = 3; col < canvas.width; col += 4) {
        ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
        ctx.beginPath();
        ctx.arc(col + (Math.random() * 2 - 1), row + (Math.random() * 1.6 - 0.8),
                1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Facade / walkway at the base, nearest the pitch.
    ctx.fillStyle = '#12151b';
    ctx.fillRect(0, canvas.height - 22, canvas.width, 22);
    return canvas;
  }

  /** Soft contact-shadow disc shared by every figure and the ball. */
  private shadowGeo(): THREE.CircleGeometry {
    if (!this.shadowGeometry) this.shadowGeometry = new THREE.CircleGeometry(0.8, 18);
    return this.shadowGeometry;
  }

  private shadowMat(): THREE.MeshBasicMaterial {
    if (!this.shadowMaterial) {
      this.shadowMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    }
    return this.shadowMaterial;
  }

  /** Classic white ball with dark panel patches, as a small canvas texture. */
  private ballTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#20242c';
    for (const [x, y] of [[10, 12], [34, 6], [54, 20], [22, 34], [46, 42], [8, 52], [36, 56]]) {
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  private paint(frame: PitchFrame): void {
    if (!this.renderer) { this.lastFrame = frame; return; }
    this.lastFrame = frame;

    const seen = new Set<number>();
    for (const player of frame.players || []) {
      if (!isFinite(player.x) || !isFinite(player.y)) continue;
      seen.add(player.playerId);
      // Overhead label: surname when known, shirt number as a stand-in until
      // the roster data lands. A late-arriving name rebuilds the mesh once.
      const label = this.namesById[player.playerId]
        || (player.shirtNumber > 0 ? String(player.shirtNumber) : '');
      let mesh = this.playerMeshes.get(player.playerId);
      if (mesh && mesh.userData['label'] !== label) {
        this.scene.remove(mesh);
        this.playerMeshes.delete(player.playerId);
        mesh = undefined;
      }
      if (!mesh) {
        mesh = this.buildPlayerMesh(
          player.teamId === this.homeTeamId, player.isGoalkeeper,
          player.shirtNumber, player.playerId, label);
        mesh.userData['label'] = label;
        this.playerMeshes.set(player.playerId, mesh);
        this.scene.add(mesh);
      }
      const worldX = player.x - 50;
      const worldZ = (player.y - 50) * MatchPitch3dComponent.Z_SCALE;
      mesh.position.set(worldX, 0, worldZ);
      const labelSprite = mesh.userData['labelSprite'];
      if (labelSprite) {
        labelSprite.visible = player.playerId === frame.ball.carrierPlayerId;
      }
      this.animateFigure(mesh, worldX, worldZ, player.playerId);
    }
    // Players who left the frame (subs, red cards, roster swap between clips).
    this.playerMeshes.forEach((mesh, id) => {
      mesh.visible = seen.has(id);
    });

    // Officials (phase clips only) — pooled, dark kit, assistants smaller.
    const officials = frame.officials || [];
    while (this.officialMeshes.length < officials.length) {
      const index = this.officialMeshes.length;
      const mesh = this.buildOfficialMesh(index === 0, index);
      this.officialMeshes.push(mesh);
      this.scene.add(mesh);
    }
    this.officialMeshes.forEach((mesh, index) => {
      const official = officials[index];
      mesh.visible = !!official;
      if (official) {
        const worldX = official.x - 50;
        const worldZ = (official.y - 50) * MatchPitch3dComponent.Z_SCALE;
        mesh.position.set(worldX, 0, worldZ);
        this.animateFigure(mesh, worldX, worldZ);
      }
    });

    // A carried ball sits at the carrier's FEET, not inside the figure — nudge
    // it toward the camera so it never clips through the body.
    const carried = !!frame.ball.carrierPlayerId;
    const ballX = frame.ball.x - 50;
    const ballZ = (frame.ball.y - 50) * MatchPitch3dComponent.Z_SCALE
        + (carried ? 1.1 : 0);
    const ballH = frame.ball.h || 0;
    if (this.ballMesh) {
      // Roll proportional to the ground covered so the panels visibly spin.
      this.ballMesh.rotation.z -= (ballX - this.ballMesh.position.x) / 0.28;
      this.ballMesh.rotation.x += (ballZ - this.ballMesh.position.z) / 0.28;
      this.ballMesh.position.set(ballX, 0.28 + ballH, ballZ);
    }
    if (this.ballShadow) {
      this.ballShadow.position.set(ballX, 0.02, ballZ);
      // The contact shadow shrinks as the ball climbs — the depth cue that
      // sells the arc.
      this.ballShadow.scale.setScalar(0.35 / (1 + ballH * 0.35));
    }

    // Skeletal mixers advance on wall-clock time (cosmetic-only layer).
    if (this.gltfFigures) {
      const now = performance.now();
      const dt = this.lastMixerMs ? Math.min(0.1, (now - this.lastMixerMs) / 1000) : 0;
      this.lastMixerMs = now;
      this.playerMeshes.forEach(mesh => mesh.userData['anim']?.mixer.update(dt));
    }

    // Broadcast camera: low and tight like a real TV main camera — it frames
    // the active third, tracks the ball on both axes, and DYNAMICALLY punches
    // in on duels/shots or pulls wide for long balls (frame zoom hint).
    this.cameraZoom += ((frame.zoom || 0) - this.cameraZoom) * 0.045;
    // High main-camera geometry: at (y32, z58, fov 48°) BOTH touchlines sit
    // inside the frame — the near line was unreachable from a low mount no
    // matter the tilt. Zoom punches in without ever losing the near line.
    const camY = 32 - this.cameraZoom * 7;
    const camZ = 58 - this.cameraZoom * 12;
    this.cameraTargetX += (ballX * (0.7 + this.cameraZoom * 0.15) - this.cameraTargetX) * 0.06;
    this.cameraTargetZ += (ballZ * (0.3 + this.cameraZoom * 0.3) - this.cameraTargetZ) * 0.06;
    this.camera.position.set(this.cameraTargetX, camY, camZ);
    this.camera.lookAt(this.cameraTargetX * 0.95, 0, this.cameraTargetZ - 2 + this.cameraZoom * 1.5);

    this.renderer.render(this.scene, this.camera);
  }

  /** FNV-1a over the kit colour strings — picks the shirt pattern. */
  private static hashString(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Shared figure geometries; every player and official reuses this one set. */
  private figureGeometries(): NonNullable<MatchPitch3dComponent['figureGeo']> {
    if (!this.figureGeo) {
      // A continuous human silhouette instead of stacked primitives: the torso
      // is lathe-turned (hips → waist → chest → sloped shoulders), the limbs
      // are round-ended capsules, and there are hands — the pieces the eye
      // checks before accepting a figure as a person.
      const torsoProfile: THREE.Vector2[] = [
        new THREE.Vector2(0.30, 0.0),   // hips
        new THREE.Vector2(0.285, 0.2),  // waist
        new THREE.Vector2(0.33, 0.55),  // chest
        new THREE.Vector2(0.375, 0.85), // shoulders
        new THREE.Vector2(0.30, 0.98),  // shoulder slope
        new THREE.Vector2(0.13, 1.05)   // into the neck
      ];
      this.figureGeo = {
        sock: new THREE.CapsuleGeometry(0.115, 0.4, 3, 8),
        thigh: new THREE.CapsuleGeometry(0.145, 0.38, 3, 8),
        boot: new THREE.BoxGeometry(0.22, 0.12, 0.4),
        shorts: new THREE.CylinderGeometry(0.31, 0.27, 0.45, 10),
        torso: new THREE.LatheGeometry(torsoProfile, 14),
        upperArm: new THREE.CapsuleGeometry(0.095, 0.3, 3, 8),
        forearm: new THREE.CapsuleGeometry(0.078, 0.28, 3, 8),
        hand: new THREE.SphereGeometry(0.088, 8, 8),
        neck: new THREE.CylinderGeometry(0.11, 0.13, 0.16, 8),
        // Realistic head-to-body ratio (~1:7.5) — oversized heads are the
        // classic "toy figure" tell.
        head: new THREE.SphereGeometry(0.29, 12, 12),
        // One geometry per SpriteHairStyle so the figure silhouette follows
        // the card. Sphere caps are partial spheres from the pole down (theta
        // length sets how far they wrap); the curly cap is coarse-segmented on
        // purpose so it reads as texture, and 'long' wraps past the equator so
        // it drops below the ears.
        hair: {
          bald: null,
          short: new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
          buzz: new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42),
          curly: new THREE.SphereGeometry(0.36, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.6),
          long: new THREE.SphereGeometry(0.33, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.8),
          // Thin front-to-back crest over the crown (x width, y height, z run).
          mohawk: new THREE.BoxGeometry(0.09, 0.26, 0.46),
          // 5 flat sides = visible facets, so it reads as spikes not a hat.
          spiky: new THREE.ConeGeometry(0.26, 0.3, 5),
          // A bun is the short cap PLUS the knot below — composite in
          // buildFigure; only the cap is registered here.
          bun: new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)
        },
        bunKnot: new THREE.SphereGeometry(0.12, 8, 8)
      };
    }
    return this.figureGeo;
  }

  private plainMaterial(color: string): THREE.MeshStandardMaterial {
    let material = this.plainMaterials.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color) });
      this.plainMaterials.set(color, material);
    }
    return material;
  }

  /** Torso material for a kit: plain shares the flat-colour cache; patterned
   *  shirts get a small canvas texture, cached by pattern+colours. */
  private torsoMaterial(pattern: string, primary: string, secondary: string): THREE.MeshStandardMaterial {
    if (pattern === 'plain' || primary === secondary) return this.plainMaterial(primary);
    const key = `${pattern}:${primary}:${secondary}`;
    let material = this.torsoMaterials.get(key);
    if (material) return material;
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = secondary;
    if (pattern === 'stripes') {
      // Canvas x maps to the capsule's wrap (u), so bars ring the torso
      // vertically; canvas y runs along the body height.
      for (let x = 8; x < 128; x += 32) ctx.fillRect(x, 0, 14, 128);
    } else if (pattern === 'hoops') {
      for (let y = 8; y < 128; y += 32) ctx.fillRect(0, y, 128, 14);
    } else { // sash — wraps at the u seam, invisible at this figure size
      ctx.strokeStyle = secondary;
      ctx.lineWidth = 26;
      ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(138, 138); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.kitTextures.set(key, texture);
    material = new THREE.MeshStandardMaterial({ map: texture });
    this.torsoMaterials.set(key, material);
    return material;
  }

  /** Play one authored gesture at normalized time u (0..1). Returns true when
   *  the gesture fully owns the limbs this frame (the run cycle is skipped);
   *  false lets the cycle keep running underneath (the cut's body lean). */
  private applyGesture(mesh: THREE.Group, limbs: any, walk: any,
                       gesture: { kind: string; sign: number }, u: number): boolean {
    switch (gesture.kind) {
      case 'kick': {
        // Wind-up (leg cocked back, knee bent) → whip through → follow-through.
        // Poses BLEND from whatever the limbs were doing (Etapa 6) — snapping
        // into a pose is what reads as robotic.
        const swing = u < 0.3 ? lerpN(0, 0.8, u / 0.3)
          : u < 0.55 ? lerpN(0.8, -1.15, (u - 0.3) / 0.25)
          : lerpN(-1.15, -0.3, (u - 0.55) / 0.45);
        blendTo(limbs.legs[0], swing, 0.5);
        if (limbs.knees) {
          blendTo(limbs.knees[0], u < 0.3 ? 0.9 : 0.15, 0.5);
          blendTo(limbs.knees[1], 0.4, 0.35);
        }
        blendTo(limbs.legs[1], 0.25, 0.35);
        blendTo(limbs.arms[0], -swing * 0.5, 0.4);
        blendTo(limbs.arms[1], swing * 0.5, 0.4);
        return true;
      }
      case 'rabona': {
        // The kicking leg wraps BEHIND the planted standing leg.
        blendTo(limbs.legs[1], -0.35, 0.4);
        blendTo(limbs.legs[0], u < 0.5 ? lerpN(0.3, -0.7, u / 0.5) : -0.7, 0.5);
        limbs.legs[0].rotation.z += (0.7 - limbs.legs[0].rotation.z) * 0.4;
        if (limbs.knees) {
          blendTo(limbs.knees[0], 0.5, 0.4);
          blendTo(limbs.knees[1], 0.25, 0.4);
        }
        blendTo(limbs.arms[0], 0.8, 0.4);
        blendTo(limbs.arms[1], -0.8, 0.4);
        return true;
      }
      case 'roulette': {
        // Full 360° body spin layered on the travel facing, arms shielding.
        mesh.rotation.y = walk.facing + u * Math.PI * 2;
        limbs.arms[0].rotation.x = -0.7;
        limbs.arms[1].rotation.x = -0.7;
        limbs.legs[0].rotation.x = 0.2;
        limbs.legs[1].rotation.x = -0.2;
        return true;
      }
      case 'stepover': {
        // Fast alternating foot circles over the ball.
        const flick = Math.sin(u * Math.PI * 6) * 0.55;
        limbs.legs[0].rotation.x = flick;
        limbs.legs[1].rotation.x = -flick * 0.4;
        if (limbs.knees) {
          limbs.knees[0].rotation.x = Math.abs(flick) * 0.8 + 0.1;
          limbs.knees[1].rotation.x = 0.2;
        }
        limbs.arms[0].rotation.x = -flick * 0.4;
        limbs.arms[1].rotation.x = flick * 0.4;
        return true;
      }
      case 'cut': {
        // Hard jink: the body leans into the new direction; the run cycle
        // keeps pumping underneath, so only the lean is authored here.
        mesh.rotation.z = gesture.sign * 0.3 * Math.sin(Math.min(1, u) * Math.PI);
        return false;
      }
      case 'dive': {
        // Keeper dive: full sideways lean, both arms stretched overhead —
        // blended in, so the launch reads as a push-off, not a snap.
        mesh.rotation.z += (gesture.sign * 0.85 - mesh.rotation.z) * 0.35;
        blendTo(limbs.arms[0], -2.4, 0.45);
        blendTo(limbs.arms[1], -2.4, 0.45);
        return true;
      }
      default:
        return false;
    }
  }

  /** Figure animation, driven by ground covered. Procedural figures swing
   *  their limbs from the hip/shoulder pivots (with kick/dive gesture poses
   *  overriding the cycle); GLTF figures cross-fade their skeletal Idle/Run
   *  clips instead. Both turn toward the direction of travel. */
  private animateFigure(mesh: THREE.Group, x: number, z: number, playerId?: number): void {
    const walk = mesh.userData['walk'];
    if (!walk) return;
    const dx = walk.lastX == null ? 0 : x - walk.lastX;
    const dz = walk.lastZ == null ? 0 : z - walk.lastZ;
    walk.lastX = x; walk.lastZ = z;
    const dist = Math.hypot(dx, dz);
    const moving = dist > 0.015;

    if (moving) {
      const target = Math.atan2(dx, dz);
      const delta = ((target - walk.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      walk.facing += delta * 0.3;
      mesh.rotation.y = walk.facing + (mesh.userData['faceOffset'] || 0);
    }

    // GLTF branch: weights + playback speed on the skeletal clips.
    const anim = mesh.userData['anim'];
    if (anim) {
      const runTarget = moving ? 1 : 0;
      anim.runWeight += (runTarget - anim.runWeight) * 0.15;
      anim.run.setEffectiveWeight(anim.runWeight);
      anim.idle.setEffectiveWeight(1 - anim.runWeight);
      anim.run.timeScale = Math.min(2.2, 0.7 + dist * 8);
      return;
    }

    const limbs = mesh.userData['limbs'];
    if (!limbs) return;

    // Gesture animations take priority over the run cycle while active.
    const gesture = playerId !== undefined ? this.gestures.get(playerId) : undefined;
    if (gesture && performance.now() < gesture.until) {
      const u = (performance.now() - gesture.start)
          / Math.max(1, gesture.until - gesture.start);
      if (this.applyGesture(mesh, limbs, walk, gesture, u)) return;
    } else {
      // Recover upright and uncross the legs after dives/rabonas.
      if (Math.abs(mesh.rotation.z) > 0.01) mesh.rotation.z *= 0.82;
      for (const leg of limbs.legs) {
        if (Math.abs(leg.rotation.z) > 0.01) leg.rotation.z *= 0.8;
      }
    }

    if (moving) {
      // Stride frequency and amplitude both scale with speed: sprinters pump,
      // joggers stroll.
      walk.phase += dist * 2.4;
      const amplitude = Math.min(0.75, 0.3 + dist * 3.5);
      const swing = Math.sin(walk.phase) * amplitude;
      limbs.legs[0].rotation.x = swing;
      limbs.legs[1].rotation.x = -swing;
      // The knee tucks as its leg swings back — the heel-lift that makes a
      // stride read human instead of scissoring sticks.
      if (limbs.knees) {
        limbs.knees[0].rotation.x = Math.max(0, swing) * 1.2 + 0.08;
        limbs.knees[1].rotation.x = Math.max(0, -swing) * 1.2 + 0.08;
      }
      limbs.arms[0].rotation.x = -swing * 0.7;
      limbs.arms[1].rotation.x = swing * 0.7;
    } else {
      for (const pivot of [...limbs.legs, ...(limbs.knees || []), ...limbs.arms]) {
        pivot.rotation.x *= 0.8;
      }
    }
  }

  /** A small procedural humanoid: socks + skin legs, shorts, kit torso, arms,
   *  skin-toned head and hair. `appearance` is pre-resolved via
   *  spriteAppearance() — descriptor-driven for players with face data, pure
   *  seed hash otherwise — so the figure rebuilds identically every session
   *  and matches the player's card whenever the backend ships a descriptor. */
  private buildFigure(appearance: SpriteAppearance, shirtColor: string,
                      shortsColor: string, sockColor: string,
                      torsoMaterial: THREE.MeshStandardMaterial,
                      gloves = false): THREE.Group {
    const geo = this.figureGeometries();
    // Colours flow through the shared plain-material cache: every hex the
    // appearance module can emit comes from bounded palettes, so the cache
    // stays bounded too.
    const skin = this.plainMaterial(appearance.skin);
    const group = new THREE.Group();

    // Contact shadow grounds the figure on the grass.
    const shadow = new THREE.Mesh(this.shadowGeo(), this.shadowMat());
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    // Two-segment limbs on pivot chains (hip→knee, shoulder→elbow) so paint()
    // can run a real stride: skin thigh, kit-sock calf, the player's own boot
    // colour, short kit sleeves over skin forearms — and hands.
    const sockMaterial = this.plainMaterial(sockColor);
    const bootMaterial = this.plainMaterial(appearance.boots);
    const handMaterial = gloves ? this.plainMaterial('#e8e8e8') : skin;
    const legPivots: THREE.Group[] = [];
    const kneePivots: THREE.Group[] = [];
    for (const side of [-0.16, 0.16]) {
      const hip = new THREE.Group();
      hip.position.set(side, 1.12, 0);
      const thigh = new THREE.Mesh(geo.thigh, skin);
      thigh.position.y = -0.26;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.52;
      const calf = new THREE.Mesh(geo.sock, sockMaterial);
      calf.position.y = -0.26;
      knee.add(calf);
      const boot = new THREE.Mesh(geo.boot, bootMaterial);
      boot.position.set(0, -0.5, 0.07);
      knee.add(boot);
      hip.add(knee);
      group.add(hip);
      legPivots.push(hip);
      kneePivots.push(knee);
    }
    const shorts = new THREE.Mesh(geo.shorts, this.plainMaterial(shortsColor));
    shorts.position.y = 0.95;
    group.add(shorts);
    const torso = new THREE.Mesh(geo.torso, torsoMaterial);
    torso.position.y = 1.12;
    group.add(torso);
    const armMaterial = this.plainMaterial(shirtColor);
    const armPivots: THREE.Group[] = [];
    for (const side of [-0.42, 0.42]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side, 2.05, 0);
      shoulder.rotation.z = side > 0 ? 0.1 : -0.1;
      const upper = new THREE.Mesh(geo.upperArm, armMaterial);
      upper.position.y = -0.2;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.42;
      // Slight permanent elbow bend — straight arms are what read "robot".
      elbow.rotation.x = -0.35;
      const forearm = new THREE.Mesh(geo.forearm, skin);
      forearm.position.y = -0.18;
      elbow.add(forearm);
      const hand = new THREE.Mesh(geo.hand, handMaterial);
      hand.position.set(0, -0.38, 0.02);
      elbow.add(hand);
      shoulder.add(elbow);
      group.add(shoulder);
      armPivots.push(shoulder);
    }
    const neck = new THREE.Mesh(geo.neck, skin);
    neck.position.y = 2.24;
    group.add(neck);
    group.userData['limbs'] = { legs: legPivots, knees: kneePivots, arms: armPivots };
    group.userData['walk'] = { phase: 0, lastX: null, lastZ: null, facing: 0 };
    const head = new THREE.Mesh(geo.head, skin);
    head.position.y = 2.55;
    group.add(head);
    // Head centre y=2.55, radius 0.29 → crown at ≈2.84. Caps sit at the head
    // centre; the crest/spike/knot pieces sit ON the crown, sunk slightly so
    // they never float when the group is scaled.
    const hairGeometry = geo.hair[appearance.hairStyle];
    if (hairGeometry) {
      const hairMaterial = this.plainMaterial(appearance.hairColor);
      const hair = new THREE.Mesh(hairGeometry, hairMaterial);
      hair.position.y = appearance.hairStyle === 'mohawk' ? 2.9
        : appearance.hairStyle === 'spiky' ? 2.93
        : 2.56;
      group.add(hair);
      if (appearance.hairStyle === 'bun') {
        // The bun composite: the cap above plus this knot, high on the back
        // of the crown. Same material, so it costs no extra cache entry.
        const knot = new THREE.Mesh(geo.bunKnot, hairMaterial);
        knot.position.set(0, 2.84, -0.2);
        group.add(knot);
      }
    }
    return group;
  }

  /** Experimental GLTF character: a skeleton-clone of the loaded template,
   *  team-tinted, with its own AnimationMixer (Idle/Run cross-faded by speed). */
  private buildCharacterMesh(isHome: boolean, isGoalkeeper: boolean,
                             label: string): THREE.Group {
    const template = this.characterTemplate!;
    const character = skeletonClone(template) as THREE.Group;
    const kit = (isHome ? this.homeKit : this.awayKit) || null;
    const tint = new THREE.Color(isGoalkeeper
      ? kitColor(kit?.gkPrimary, isHome ? '#fde047' : '#22d3ee')
      : kitColor(kit?.outfieldPrimary, isHome ? '#3498db' : '#e74c3c'));
    character.traverse(node => {
      const mesh = node as THREE.Mesh;
      if ((mesh as any).isMesh && mesh.material) {
        const material = (mesh.material as THREE.MeshStandardMaterial).clone();
        material.color.multiply(tint);
        mesh.material = material;
      }
    });
    character.scale.setScalar(1.25);
    character.rotation.y = Math.PI; // template faces -Z; our forward is +Z

    const group = new THREE.Group();
    group.add(character);
    const shadow = new THREE.Mesh(this.shadowGeo(), this.shadowMat());
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.scale.setScalar(0.6);
    group.add(shadow);
    if (label) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.labelTexture(label), depthTest: false
      }));
      sprite.scale.set(1.7, 0.42, 1);
      sprite.position.y = 2.6;
      group.add(sprite);
      sprite.visible = false;
      group.userData['labelSprite'] = sprite;
    }

    const mixer = new THREE.AnimationMixer(character);
    const idleClip = THREE.AnimationClip.findByName(this.characterClips, 'Idle');
    const runClip = THREE.AnimationClip.findByName(this.characterClips, 'Run');
    if (idleClip && runClip) {
      const idle = mixer.clipAction(idleClip);
      const run = mixer.clipAction(runClip);
      idle.play();
      run.play();
      run.setEffectiveWeight(0);
      group.userData['anim'] = { mixer, idle, run, runWeight: 0 };
    }
    group.userData['walk'] = { phase: 0, lastX: null, lastZ: null, facing: 0 };
    return group;
  }

  private buildPlayerMesh(isHome: boolean, isGoalkeeper: boolean,
                          shirtNumber: number, playerId: number,
                          label: string): THREE.Group {
    if (this.gltfFigures && this.characterTemplate) {
      return this.buildCharacterMesh(isHome, isGoalkeeper, label);
    }
    const kit = (isHome ? this.homeKit : this.awayKit) || null;
    const color = isGoalkeeper
      ? kitColor(kit?.gkPrimary, isHome ? '#fde047' : '#22d3ee')
      : kitColor(kit?.outfieldPrimary, isHome ? '#3498db' : '#e74c3c');
    const secondary = kitColor(kit?.outfieldSecondary, '#eeeeee');

    // The shirt pattern belongs to the kit, not the player: hashing the two
    // kit colours keeps the whole team on one cached torso material.
    const pattern = isGoalkeeper ? 'plain' : MatchPitch3dComponent.KIT_PATTERNS[
      MatchPitch3dComponent.hashString(`${color}|${secondary}`)
        % MatchPitch3dComponent.KIT_PATTERNS.length];

    const group = this.buildFigure(
      spriteAppearance(this.faces?.[playerId] ?? null, playerId), color,
      isGoalkeeper ? color : secondary,
      isGoalkeeper ? color : secondary,
      this.torsoMaterial(pattern, color, secondary),
      isGoalkeeper);
    if (label) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.labelTexture(label), depthTest: false
      }));
      // Sprite scale inherits the group scale below — these local values land
      // at ≈1.8×0.45 world units, a discreet tag instead of a billboard.
      sprite.scale.set(2.6, 0.65, 1);
      sprite.position.y = 3.25;
      group.add(sprite);
      // Shown only on the ball carrier — a name over all 22 heads is the
      // single most "video-gamey" element on the pitch.
      sprite.visible = false;
      group.userData['labelSprite'] = sprite;
    }
    // True-to-pitch proportions: raw figure ≈3.1 units → ≈2.2 world units
    // (~2.1 m at 1u≈1.05m), slightly slimmed. The crossbar (2.35) now clears
    // every head — the ratio that makes the scene read as real football.
    group.scale.set(0.64, 0.72, 0.64);
    return group;
  }

  private buildOfficialMesh(isReferee: boolean, index: number): THREE.Group {
    // Officials share the figure upgrades (arms, socks, seeded skin/hair). A
    // bright lime kit (real-world referee colours) keeps them visible against
    // both kits and the dark stands; the pool index seeds a stable crew
    // appearance, offset so official 0 never mirrors playerId 0. Officials
    // have no face descriptor — passing null keeps them on the hash path.
    // Classic referee black with white shorts/socks — the lime kit read as a
    // second goalkeeper next to a yellow-shirted keeper. No team wears this
    // combination, so officials are unmistakable now.
    const black = '#15181c';
    const white = '#e8e8e8';
    const look = { ...spriteAppearance(null, 1000003 + index * 101), boots: black };
    const group = this.buildFigure(look, black, white, white, this.plainMaterial(black));
    group.scale.set(0.6, isReferee ? 0.68 : 0.63, 0.6);
    if (!isReferee) {
      // Assistant's flag.
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.4),
        new THREE.MeshBasicMaterial({ color: 0xf6c945, side: THREE.DoubleSide }));
      flag.position.set(0.7, 2.2, 0);
      group.add(flag);
    }
    return group;
  }

  /** Small cached canvas texture with the shirt number on a dark pill. */
  private numberTexture(shirtNumber: number, color: string): THREE.Texture {
    const key = `${shirtNumber}:${color}`;
    let texture = this.numberTextures.get(key);
    if (texture) return texture;
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(shirtNumber), 32, 34);
    texture = new THREE.CanvasTexture(canvas);
    this.numberTextures.set(key, texture);
    return texture;
  }

  /** Overhead label pill: the player's surname (or shirt number fallback). */
  private labelTexture(text: string): THREE.Texture {
    let texture = this.labelTextures.get(text);
    if (texture) return texture;
    const canvas = document.createElement('canvas');
    canvas.width = 192; canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
    ctx.beginPath();
    // roundRect is not in TS 4.8's lib — a plain pill from two arcs + rect.
    ctx.arc(24, 24, 20, Math.PI / 2, Math.PI * 1.5);
    ctx.arc(168, 24, 20, Math.PI * 1.5, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let display = text;
    while (display.length > 3 && ctx.measureText(display).width > 150) {
      display = display.slice(0, -1);
    }
    ctx.fillText(display, 96, 26);
    texture = new THREE.CanvasTexture(canvas);
    this.labelTextures.set(text, texture);
    return texture;
  }
}

/** Clamped linear interpolation used by the gesture keyframes. */
function lerpN(from: number, to: number, t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return from + (to - from) * clamped;
}

/** Blend a pivot's X rotation toward a pose target — the per-frame smoothing
 *  that keeps gestures from snapping in from whatever came before. */
function blendTo(pivot: THREE.Object3D, target: number, factor: number): void {
  pivot.rotation.x += (target - pivot.rotation.x) * factor;
}
