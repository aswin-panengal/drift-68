import { CAMERA_NAMES, CAR_IDS, DEFAULT_SAVE, LAP_COUNTS, TRACK_IDS, recordKey, type HostMessage, type SaveData, type DisplayMode, type Screen, type Snapshot, type TrackId, type LapCount } from '../../shared/types';
import { validSnapshot,recoverSave } from '../../shared/validation';
import { ROOM_CODE,roomLaps,roomTrack,socketOrigin,type CarPose,type RoomIdentity,type RoomRules,type RoomView,type MultiplayerResume } from '../../shared/multiplayer';
import { Bridge } from './Bridge';
import { Simulation,createSnapshot } from './Simulation';
import { GameLoop } from './GameLoop';
import { RoomClient,newRoomIdentity } from './RoomClient';
import { InputManager } from '../systems/InputManager';
import { AudioManager } from '../systems/AudioManager';
import { RendererManager } from '../rendering/RendererManager';
import { CARS } from '../vehicle/CarConfigs';
import { tireSlip } from '../vehicle/VehiclePhysics';
import { TRACKS,TrackPath } from '../tracks/TrackConfigs';
import { icon,roadLogo } from '../ui/icons';
import license from '../../../LICENSE?raw';
import notices from '../../../THIRD_PARTY_NOTICES.md?raw';

const time=(t:number):string=>`${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,'0')}`;
const points=(n:number):string=>Math.floor(n).toLocaleString('en-US');
const button=(action:string,text:string,primary=false,ico=''):string=>`<button data-action="${action}" class="${primary?'primary':''}">${ico?icon(ico):''}<span>${text}</span>${primary?icon('arrow'):''}</button>`;
const iconButton=(action:string,label:string,ico:string):string=>`<button class="icon-button" data-action="${action}" title="${label}" aria-label="${label}">${icon(ico)}</button>`;
const preferenceLabels = {sound:'Sound',minimap:'Minimap',advancedHud:'HUD details'};
const pauseShortcuts = `<details class="pause-shortcuts">
  <summary>Keyboard shortcuts</summary>
  <dl>
    <dt><kbd>W A S D</kbd> / <kbd>Arrows</kbd></dt><dd>Drive and steer</dd>
    <dt><kbd>Space</kbd></dt><dd>Handbrake</dd>
    <dt><kbd>Shift</kbd></dt><dd>Boost</dd>
    <dt><kbd>R</kbd></dt><dd>Reset to checkpoint</dd>
    <dt><kbd>V</kbd> / <kbd>C</kbd></dt><dd>Camera view</dd>
    <dt><kbd>M</kbd></dt><dd>Sound</dd>
    <dt><kbd>N</kbd></dt><dd>Minimap</dd>
    <dt><kbd>H</kbd></dt><dd>HUD details</dd>
    <dt><kbd>Esc</kbd></dt><dd>Pause or go back</dd>
    <dt><kbd>← →</kbd></dt><dd>Choose car or circuit in setup</dd>
    <dt><kbd>↑ ↓</kbd></dt><dd>Switch setup picker</dd>
    <dt><kbd>Enter</kbd></dt><dd>Join from the room code field</dd>
  </dl>
</details>`;

type TitleDestination = 'modes' | 'settings' | 'licenses';
type SetupPicker = 'car' | 'track';
const setupRow=(key:SetupPicker,label:string):string=>`<section class="setup-picker" data-picker="${key}" aria-label="${label}" tabindex="0">
  <h2>${label}</h2>
  <div class="setup-options-row">
    <button class="setup-arrow" data-action="previous-${key}" aria-label="Previous ${label.toLowerCase()}">${icon('back')}</button>
    <div class="setup-selection" data-selection="${key}" aria-live="polite"></div>
    <button class="setup-arrow next" data-action="next-${key}" aria-label="Next ${label.toLowerCase()}">${icon('back')}</button>
  </div>
</section>`;
const titleMenu = `<section class="title-screen" aria-labelledby="title-heading">
  <div class="title-main">
    <h1 id="title-heading">Drift <span>68</span></h1>
    <button class="title-play" data-action="play"><span>Play</span>${icon('arrow')}</button>
  </div>
  <nav class="title-links" aria-label="Game information">
    ${button('settings','Settings')}${button('licenses','Licenses')}
  </nav>
</section>`;
const modeChoices = `<button class="mode-choice" data-action="start-flow" aria-label="Solo" aria-describedby="solo-description">
  <span><strong>Solo</strong><small id="solo-description">Lap challenge or Zen Drive</small></span>${icon('arrow')}
</button><button class="mode-choice" data-action="multiplayer" aria-label="1v1" aria-describedby="duel-description">
  <span><strong>1v1</strong><small id="duel-description">Race a friend with a room code</small></span>${icon('arrow')}
</button>`;

export class Game {
  readonly bridge=new Bridge();readonly audio=new AudioManager();readonly root:HTMLElement;
  simulation=new Simulation(createSnapshot(structuredClone(DEFAULT_SAVE)));
  data:SaveData=structuredClone(DEFAULT_SAVE);mode:DisplayMode='sidebar';
  renderer?:RendererManager;readonly loop:GameLoop;readonly input:InputManager;
  active=false;lease=false;token=0;visible=true;
  private returnScreen:Screen='title';private newRecord=false;private lastHud=0;private lastCapture=0;private error='';
  private titleDestination?:TitleDestination;
  private overlay:HTMLElement;private hud:HTMLElement;private scene:HTMLElement;private diagnostic:HTMLElement;
  private counters={fps:0,frameTime:0,frames:0,updates:0};private fpsTime=performance.now();private lastFrames=0;
  private toastTimer=0;
  private readonly roomServer:string;
  private multiplayer?:RoomClient;
  private resumeRoom?:MultiplayerResume;
  private soloSession?:Snapshot;
  private roomTrack:TrackId='coastal';private roomLaps:LapCount=1;
  private roomCode='';private lobbyNotice='';
  private racePrepared=false;private readyRequested=false;private roomWasReady=false;
  private readonly opponentPose:CarPose={x:0,z:0,heading:0,vx:0,vz:0};
  constructor(app:HTMLElement){
    this.roomServer=socketOrigin(this.bridge.standalone?import.meta.env.VITE_DRIFT_MULTIPLAYER_URL:app.dataset.roomServer);
    app.innerHTML=`<main id="game-root" tabindex="0" aria-label="Drift 68 game. Click the scene to drive."><div id="scene"></div><header id="topbar"><div class="wordmark">${roadLogo}<span>Drift 68</span></div><nav aria-label="Game view">${iconButton('restart','Restart lap','restart')}${iconButton('pause','Pause game','pause')}${iconButton('expand','Open in editor','expand')}${iconButton('maximize','Maximize editor','expand')}${iconButton('sidebar','Return to Explorer','sidebar')}</nav></header><div id="hud" hidden></div><section id="overlay" aria-label="Game menus"></section><div id="toast" role="status" aria-live="polite"></div><pre id="diagnostics" hidden></pre><div id="focus-hint" hidden>Click the road to drive</div></main>`;
    this.root=app.querySelector('#game-root')!;this.overlay=app.querySelector('#overlay')!;this.hud=app.querySelector('#hud')!;this.scene=app.querySelector('#scene')!;this.diagnostic=app.querySelector('#diagnostics')!;
    if (this.bridge.standalone) {
      this.root.dataset.standalone = '';
    }
    this.loop=new GameLoop(dt=>this.update(dt),dt=>this.render(dt),30);
    this.input=new InputManager(this.root,()=>this.active&&this.lease&&this.visible&&this.state.screen==='drive',()=>this.pause(),action=>{
      if (action === 'pause') { this.pause(); return; }
      if (action === 'reset') {
        this.simulation.reset();
        this.audio.resetEngine();
        this.renderer?.resetTracking();
        this.toast('Back on track. Combo cleared.');
        return;
      }
      const settings = this.state.settings;
      if (action === 'camera') {
        settings.camera = (settings.camera + 1) % CAMERA_NAMES.length;
        this.toast(`${CAMERA_NAMES[settings.camera]} camera`);
      } else {
        settings[action] = !settings[action];
        if (action === 'sound') {
          if (settings.sound) void this.audio.unlock(settings);
          else this.audio.stop(true);
        } else {
          this.syncHudOptions();
        }
        this.toast(`${preferenceLabels[action]} ${settings[action] ? 'on' : 'off'}`);
      }
      this.persist(false);
    });
    this.root.addEventListener('click',this.click);
    this.root.addEventListener('change',this.change);
    this.root.addEventListener('keydown',this.menuKeys);
    this.bridge.listen(m=>this.receive(m));this.bridge.post({type:'ready'});
    window.addEventListener('pagehide',this.pagehide);
    if(import.meta.env.DEV){Object.assign(window,{__drift:this});}
  }
  get state():Snapshot {return this.simulation.state;}
  private receive(message:HostMessage):void {
    if(message.type==='idle'){
      this.closeRoom(true);
      this.resumeRoom=undefined;
      this.titleDestination=undefined;
      this.stop();this.audio.dispose();this.lease=false;this.data=recoverSave(message.data);this.disposeRenderer();
      this.restoreSceneRoot();
      this.root.dataset.screen='idle';this.overlay.hidden=false;this.hud.hidden=true;
      this.root.classList.toggle('reduced-motion',this.data.settings.reducedMotion);
      this.root.setAttribute('data-cover','');
      this.root.removeAttribute('data-multiplayer');
      this.root.setAttribute('aria-busy','false');
      this.overlay.innerHTML=titleMenu;this.syncMode();return;
    }
    if(message.type==='initialize'){
      this.stop();this.lease=false;this.token=message.token;this.data=recoverSave(message.data);this.mode=message.mode;
      this.resumeRoom=this.roomServer?message.room:undefined;
      const restored=message.snapshot??this.bridge.restored();
      const state=validSnapshot(restored)?structuredClone(restored):createSnapshot(this.data);state.settings={...this.data.settings};
      this.root.classList.toggle('reduced-motion',state.settings.reducedMotion);
      if(state.screen==='drive')state.screen='pause';
      if(state.screen==='circuits')state.screen='garage'; // The former circuit page shares the Solo setup now.
      const destination=this.titleDestination;
      this.titleDestination=undefined;
      if(destination&&!this.resumeRoom&&(destination!=='modes'||['title','modes','settings','licenses'].includes(state.screen))){
        if(destination==='settings')this.returnScreen='title';
        state.screen=destination;
      }
      this.disposeRenderer();
      this.simulation=new Simulation(state);
      this.show(state.screen);
      if(this.error)return;
      this.root.setAttribute('aria-busy','true');
      this.overlay.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=true;});
      this.bridge.post({type:'initialized',token:this.token});
      return;
    }
    if(message.type==='grant'&&message.token===this.token){
      const restore=this.resumeRoom;
      this.resumeRoom=undefined;
      this.lease=true;this.root.setAttribute('aria-busy','false');this.overlay.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=false;});
      if(restore)this.restoreRoom(restore);
      else if(this.state.screen==='modes')this.overlay.querySelector<HTMLButtonElement>('[data-action="start-flow"]')?.focus({preventScroll:true});
      return;
    }
    if(message.type==='suspend'&&message.token===this.token){this.pause();this.stop();this.closeRoom(true);this.audio.dispose();this.bridge.post({type:'suspended',token:this.token,snapshot:this.snapshot()});this.lease=false;this.disposeRenderer();return;}
    if(message.type==='visibility'){
      this.visible=message.visible;if(!message.visible){this.pause();this.capture();this.disposeRenderer();}
      else if(this.lease)this.show(this.state.screen);
      return;
    }
    if(message.type==='mode'){this.mode=message.mode;this.syncMode();this.renderer?.configure(this.state.settings,this.mode);this.still();}
    if(message.type==='data'){
      const key=recordKey(this.state.track,this.state.car);
      const previousBest=this.data.records[key]?.score;
      this.data=recoverSave(message.data);
      if(this.root.dataset.screen==='idle')this.root.classList.toggle('reduced-motion',this.data.settings.reducedMotion);
      if(this.state.screen==='garage'&&this.data.records[key]?.score!==previousBest)this.updateSetup();
      if(this.state.screen==='results')this.show('results');
    }
    if(message.type==='error'){this.error=message.message;this.showError();}
  }
  private ensureRenderer():void {
    if(this.renderer)return;
    this.renderer=new RendererManager(this.scene,this.state.settings,this.mode,()=>{this.pause();this.toast('Graphics paused. Waiting for the WebGL context to recover.');},()=>{if(this.renderer&&!this.renderer.contextLost){this.still();}});
  }
  private disposeRenderer():void {this.renderer?.dispose();this.renderer=undefined;}
  private restoreSceneRoot():void {if(this.scene.parentElement!==this.root)this.root.prepend(this.scene);}
  private loadScene():void {
    this.renderer?.load(this.state,this.simulation.path,this.state.screen==='garage');
    if(this.racePrepared)this.renderer?.setOpponent(this.multiplayer?.view?.peer?.car);
  }
  private syncMode():void {this.root.dataset.mode=this.mode;this.loop.fps=this.mode==='sidebar'||this.state.settings.quality==='low'?30:60;const max=this.root.querySelector<HTMLButtonElement>('[data-action="maximize"]')!;max.innerHTML=icon(this.mode==='maximized'?'restore':'expand');max.title=this.mode==='maximized'?'Restore editor':'Maximize editor';max.setAttribute('aria-label',max.title);}
  private still():void {this.renderer?.draw(this.state,0,true);}
  private stop():void {this.active=false;this.loop.stop();this.input?.clear();this.audio.stop();}
  pause():void {
    if(this.soloSession){
      if(!this.racePrepared||(!this.active&&!this.readyRequested))return;
      this.readyRequested=false;
      this.multiplayer?.command('pause');
      this.show('pause');
      this.capture();
      return;
    }
    if(!this.active)return;this.stop();if(this.state.screen==='drive'){this.show('pause');this.capture();}
  }
  private start():void {
    if(!this.lease||!this.visible||!this.renderer||this.renderer.contextLost)return;
    this.show('drive');this.root.focus({preventScroll:true});this.active=true;this.input.clear();
    this.root.querySelector<HTMLElement>('#focus-hint')!.hidden=true;
    void this.audio.unlock(this.state.settings);this.loop.start();this.capture();
  }
  private beginDrive():void {this.simulation.restart();this.show('drive',true);this.capture();}
  private snapshot():Snapshot {return structuredClone(this.soloSession??this.state);}
  private capture():void {
    if(this.soloSession){
      const room=this.multiplayer;
      const resume=room?.resumable
        ? {identity:room.identity,race:this.racePrepared?this.state:undefined}:undefined;
      if(this.lease)this.bridge.post({type:'roomSnapshot',token:this.token,room:resume});
      return;
    }
    const snapshot=this.snapshot();this.bridge.snapshot(snapshot);if(this.lease)this.bridge.post({type:'snapshot',token:this.token,snapshot});
  }
  private persist(configureView=true):void {
    const solo=this.soloSession??this.state;
    this.data.car=solo.car;this.data.track=solo.track;this.data.zen=solo.zen;
    this.data.settings={...this.state.settings};
    if(this.soloSession)this.soloSession.settings={...this.data.settings};
    this.bridge.post({type:'save',data:this.data});
    if(configureView){
      this.renderer?.configure(this.state.settings,this.mode);
      this.syncMode();
    }
    this.capture();
  }
  private update(dt:number):void {
    if(!this.active||!this.lease||!this.visible)return;
    const input=this.input.read(this.state.settings.gamepad);
    if(!this.active)return;
    const finished = this.simulation.step(input, dt);
    const vehicle = this.state.vehicle;
    this.audio.update(this.state.car, vehicle, input.throttle, tireSlip(vehicle), this.state.settings, dt);
    this.multiplayer?.sendPose(vehicle);
    if(finished){
      if(this.multiplayer){
        this.multiplayer.command('finish');
        this.show('pause');
        this.capture();
        return;
      }
      this.stop();void this.audio.playCue(this.state.settings,true);
      const s=this.state,score=Math.floor(s.score.banked),old=this.data.records[recordKey(s.track,s.car)];this.newRecord=!old||score>old.score;
      this.bridge.post({type:'record',track:s.track,car:s.car,entry:{score,time:s.lap.elapsed,longest:s.score.longest,multiplier:s.score.bestMultiplier}});
      this.show('results');this.capture();return;
    }
    this.lastCapture+=dt;if(this.lastCapture>2){this.lastCapture=0;this.capture();}
  }
  private render(dt:number):void {
    const room=this.multiplayer;
    if(room){
      const now=performance.now();
      if(room.opponentTimedOut(now)){this.pause();this.toast('Opponent updates stopped. The race is paused.');return;}
      if(room.poses.sample(now,this.opponentPose))this.renderer?.moveOpponent(this.opponentPose,dt);
    }
    this.renderer?.draw(this.state,dt);this.lastHud+=dt;
    if(this.lastHud>=.1){this.lastHud=0;this.updateHud();}
    if(import.meta.env.DEV){
      const now=performance.now();if(now-this.fpsTime>500){this.counters={fps:(this.loop.frames-this.lastFrames)*1000/(now-this.fpsTime),frameTime:dt*1000,frames:this.loop.frames,updates:this.loop.updates};this.fpsTime=now;this.lastFrames=this.loop.frames;
        if(new URLSearchParams(location.search).has('debug')){this.diagnostic.hidden=false;const heap=(performance as Performance&{memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize;this.diagnostic.textContent=JSON.stringify({...this.counters,...this.renderer?.diagnostics(),heapBytes:heap,view:this.mode},null,2);}
      }
    }
  }
  diagnostics():object {return {...this.counters,...this.renderer?.diagnostics(),running:this.loop.running,active:this.active,lease:this.lease,token:this.token,view:this.mode,simulationUpdates:this.loop.updates};}
  private openLobby():void {
    this.soloSession=this.snapshot();
    this.roomTrack=this.state.track;
    this.roomCode='';
    this.lobbyNotice='';
    this.show('lobby');
  }
  private connectRoom(action:'create'|'join'|'resume',identity:RoomIdentity,rules?:RoomRules):void {
    this.multiplayer?.dispose(false);
    this.lobbyNotice='';
    const room=new RoomClient(identity,this.roomServer,()=>this.roomChanged(room));
    this.multiplayer=room;
    room.open(action,rules);
    this.show(this.racePrepared?'pause':'lobby');
  }
  private restoreRoom(resume:MultiplayerResume):void {
    this.openLobby();
    if(resume.race){
      const state=structuredClone(resume.race);
      state.settings={...this.state.settings};
      state.screen='pause';
      this.simulation=new Simulation(state);
      this.racePrepared=true;
    }
    this.connectRoom('resume',resume.identity);
  }
  private closeRoom(leave:boolean):void {
    this.multiplayer?.dispose(leave);
    this.multiplayer=undefined;
    this.racePrepared=this.readyRequested=this.roomWasReady=false;
    if(this.soloSession){
      if(this.lease)this.bridge.post({type:'roomSnapshot',token:this.token});
      this.simulation=new Simulation(this.soloSession);
      this.soloSession=undefined;
    }
  }
  private leaveLobby():void {
    this.closeRoom(true);
    this.show('modes');
    this.capture();
  }
  private joinRoom():void {
    const input=this.overlay.querySelector<HTMLInputElement>('#room-code');
    if(!input||!this.roomServer)return;
    this.roomCode=input.value.trim().toUpperCase();
    if(!ROOM_CODE.test(this.roomCode)){
      this.lobbyNotice='Enter the eight-character room code.';
      this.updateLobbyNotice();
      input.focus();
      return;
    }
    this.connectRoom('join',newRoomIdentity(this.state.car,this.roomCode));
  }
  private prepareRace(view:RoomView,identity:RoomIdentity):void {
    const snapshot=createSnapshot({...this.data,car:identity.car,track:view.track,zen:false,settings:this.state.settings},view.laps);
    this.simulation=new Simulation(snapshot);
    const vehicle=this.state.vehicle;
    const offset=view.slot===0?-1.45:1.45;
    vehicle.x+=Math.cos(vehicle.heading)*offset;
    vehicle.z-=Math.sin(vehicle.heading)*offset;
    this.state.screen='pause';
    this.racePrepared=true;
  }
  private roomChanged(room:RoomClient):void {
    if(room!==this.multiplayer)return;
    const view=room.view;
    if(!room.connected||!view){
      this.readyRequested=this.roomWasReady=false;
      if(this.state.screen!=='results')this.show(this.racePrepared?'pause':'lobby');
      this.capture();
      return;
    }
    if(view.phase==='lobby'){
      this.show('lobby');
      this.capture();
      return;
    }
    if(!this.racePrepared)this.prepareRace(view,room.identity);
    this.renderer?.setOpponent(view.peer?.car);
    if(view.phase==='results'){
      this.readyRequested=false;
      void this.audio.playCue(this.state.settings,true);
      this.show('results');
    }else{
      if(this.roomWasReady&&!view.ready)this.readyRequested=false;
      this.roomWasReady=view.ready;
      if(view.ready&&(!this.readyRequested||!this.visible||!this.input.ownsFocus)){
        room.command('pause');
        this.readyRequested=false;
      }
      if(this.readyRequested&&view.ready&&view.peer?.ready&&view.peer.online){
        if(this.state.lap.finished){
          room.command('finish');
          this.show('pause');
        }else if(!this.active){
          this.start();
          this.multiplayer?.sendPose(this.state.vehicle);
        }
      }else this.show('pause');
    }
    this.capture();
  }
  private readyRace():void {
    const room=this.multiplayer;
    if(!this.visible||this.renderer?.contextLost||!room?.connected||!room.view?.peer?.online||this.readyRequested)return;
    this.root.focus({preventScroll:true});
    this.readyRequested=true;
    void this.audio.unlock(this.state.settings);
    room.command('ready');
    this.show('pause');
  }
  private updateLobbyNotice():void {
    const status=this.overlay.querySelector('#room-status');
    if(status)status.textContent=this.lobbyNotice||this.multiplayer?.notice||'';
  }
  private roomMenu():string {
    const room=this.multiplayer,view=room?.view;
    const back=this.back('leave-room');
    if(!this.roomServer){
      const setup=this.bridge.standalone?'Set VITE_DRIFT_MULTIPLAYER_URL before building or running the game.':'Reset the Drift 68 Multiplayer server setting to use the hosted server, then reload VS Code.';
      return `${back}<h1>Multiplayer</h1><p class="intro">${setup}</p>`;
    }
    if(view&&room?.connected){
      const status=view.peer?.online?'Two players connected.':view.peer?'Waiting for your opponent to reconnect…':'Share the code with one other player.';
      const start=view.slot===0&&view.peer?.online?button('start-race','Start race',true):'';
      return `${back}
        <h1>Room code</h1>
        <p class="room-code">${room.identity.code}</p>
        <p class="intro">${TRACKS[view.track].name} · ${view.laps} ${view.laps===1?'lap':'laps'}</p>
        <p class="quiet" role="status">${status}</p>
        <div class="menu-actions">${start}${button('leave-room','Leave room')}</div>`;
    }
    if(room&&!room.terminal)return `${back}<h1>Multiplayer</h1><p id="room-status" class="intro" role="status"></p>`;
    const code=ROOM_CODE.test(this.roomCode)?this.roomCode:'';
    const circuits=Object.values(TRACKS).map(t=>`<option value="${t.id}" ${t.id===this.roomTrack?'selected':''}>${t.name}</option>`).join('');
    const laps=LAP_COUNTS.map(n=>`<option value="${n}" ${n===this.roomLaps?'selected':''}>${n}</option>`).join('');
    return `${back}
      <h1>Multiplayer</h1>
      <p id="room-status" class="intro" role="status"></p>
      <div class="settings-list room-settings">
        <label class="setting">Circuit<select aria-label="Circuit" data-room-setting="track">${circuits}</select></label>
        <label class="setting">Laps<select aria-label="Laps" data-room-setting="laps">${laps}</select></label>
      </div>
      <div class="menu-actions room-actions">${button('create-room','Create room',true)}</div>
      <label class="setting" for="room-code">Room code
        <input id="room-code" type="text" maxlength="8" spellcheck="false" autocomplete="off" value="${code}">
      </label>
      <div class="menu-actions room-actions">${button('join-room','Join room')}</div>`;
  }
  private racePauseMenu():string {
    const room=this.multiplayer,view=room?.view;
    const canReady=room?.connected&&view?.peer?.online&&!this.readyRequested;
    const status=room?.notice||(view?.peer?.online
      ? this.readyRequested?(this.state.lap.finished&&view.peer.ready?'Confirming finish…':'Waiting for your opponent to be ready…'):'Both players must be ready to drive.'
      : 'Waiting for your opponent to reconnect…');
    return `<div class="pause-copy"><h1>Race paused</h1><p class="intro" role="status">${status}</p>${pauseShortcuts}<div class="menu-actions">${canReady?button('race-ready','Ready to drive',true,'play'):''}${button('leave-room','Leave room')}</div></div>`;
  }
  private setupMenu():string {
    return `<section class="setup-screen" data-menu="garage" aria-labelledby="setup-heading">
      <header class="setup-header">${this.back('modes')}<h1 id="setup-heading">Solo setup</h1></header>
      <div class="setup-layout">
        <div class="setup-controls">
          ${setupRow('car','Car')}
          ${setupRow('track','Circuit')}
          <div class="mode-switch" role="group" aria-label="Drive mode">
            <button data-action="challenge">Lap challenge</button><button data-action="zen">Zen Drive</button>
          </div>
          <button class="primary" data-action="begin"><span></span>${icon('arrow')}</button>
          <p class="setup-keys">← → Change selection <span>↑ ↓ Switch picker</span></p>
        </div>
        <section class="setup-showcase" aria-label="Car preview and details">
          <div class="setup-preview"></div>
          <div class="car-detail"></div>
        </section>
      </div>
    </section>`;
  }
  private updateSetup():void {
    const {car:carId,track:trackId,zen}=this.state;
    const car=CARS[carId], track=TRACKS[trackId], path=this.simulation.path;
    const carSelection=this.overlay.querySelector<HTMLElement>('[data-selection="car"]');
    const circuitSelection=this.overlay.querySelector<HTMLElement>('[data-selection="track"]');
    if(!carSelection||!circuitSelection)return;
    carSelection.dataset.selected=carId;
    carSelection.innerHTML=`<strong>${car.name}</strong><small>${car.personality}</small>`;
    const route=path.svgPath(),start=path.samples[0]!,best=this.data.records[recordKey(trackId,carId)];
    circuitSelection.dataset.selected=trackId;
    circuitSelection.innerHTML=`<svg class="track-preview ${trackId}" viewBox="-145 -135 290 270" aria-hidden="true">
      <path class="map-shadow" d="${route}"/><path class="map-road" d="${route}"/>
      <circle cx="${start.x}" cy="${start.z}" r="5"/>
    </svg><div><strong>${track.name}</strong><small>${track.difficulty} · ${Math.round(path.length)} m</small>
      ${best?`<small>Best ${points(best.score)} pts</small>`:''}</div>`;
    this.overlay.querySelector('.car-detail')!.innerHTML=`<h2>${car.name}</h2><p>${car.description}</p>
      <dl class="handling">${(['power','handling','drift'] as const).map(key=>`<div>
        <dt>${key==='drift'?'Drift tendency':key.charAt(0).toUpperCase()+key.slice(1)}</dt>
        <dd aria-label="${car[key]} of 5">${Array.from({length:5},(_,i)=>`<i class="${i<car[key]?'filled':''}"></i>`).join('')}</dd>
      </div>`).join('')}<div><dt>Response</dt><dd>${car.personality.split(' · ')[0]}</dd></div></dl>`;
    for(const option of this.overlay.querySelectorAll<HTMLButtonElement>('.mode-switch button')){
      option.setAttribute('aria-pressed',String((option.dataset.action==='zen')===zen));
    }
    this.overlay.querySelector('[data-action="begin"] span')!.textContent=zen?'Begin Zen Drive':'Head to the start';
  }
  private cycleSetup(picker:SetupPicker,step:number):void {
    if(picker==='car'){
      this.state.car=CAR_IDS[(CAR_IDS.indexOf(this.state.car)+step+CAR_IDS.length)%CAR_IDS.length]!;
    }else{
      this.state.track=TRACK_IDS[(TRACK_IDS.indexOf(this.state.track)+step+TRACK_IDS.length)%TRACK_IDS.length]!;
    }
    this.simulation.restart();
    if(picker==='car')this.loadScene();
    this.persist();
    this.updateSetup();
  }
  private show(screen:Screen,reloadScene=false):void {
    if(screen!=='drive')this.stop();
    this.input.clear();this.state.screen=screen;this.root.dataset.screen=screen;this.error='';
    this.root.toggleAttribute('data-multiplayer',!!this.soloSession);
    this.restoreSceneRoot();
    if(screen==='garage'){
      this.overlay.innerHTML=this.setupMenu();
      this.overlay.querySelector('.setup-preview')!.append(this.scene);
      this.updateSetup();
    }
    const cover=screen==='title'||screen==='modes'||screen==='lobby'||screen==='licenses'
      ||(screen==='settings'&&this.returnScreen==='title');
    this.root.toggleAttribute('data-cover',cover);
    if(cover)this.disposeRenderer();
    else if(this.visible&&(!this.renderer||reloadScene)){
      try{this.ensureRenderer();this.loadScene();}
      catch(error){
        this.disposeRenderer();
        this.error=error instanceof Error?error.message:'Unable to create a WebGL scene.';
        this.showError();
        return;
      }
    }
    this.overlay.hidden=screen==='drive';this.hud.hidden=!['drive','pause'].includes(screen);
    this.root.querySelector<HTMLElement>('#focus-hint')!.hidden=screen!=='drive'||this.active;
    if(screen==='garage'){this.syncMode();return;}
    if(screen==='title'){this.overlay.innerHTML=titleMenu;this.syncMode();return;}
    if(screen==='modes'){
      this.overlay.innerHTML=`<section class="mode-screen" aria-labelledby="mode-heading">
        ${this.back('title')}<h1 id="mode-heading">Choose a mode</h1>
        <div class="mode-choices">${modeChoices}</div>
      </section>`;
      this.syncMode();
      return;
    }
    if(screen==='drive'){
      this.overlay.innerHTML='';this.buildHud();this.updateHud();this.still();return;
    }
    if(screen==='pause'){this.buildHud();this.updateHud();}
    const car=CARS[this.state.car],track=TRACKS[this.state.track];
    let content='';
    if(screen==='lobby')content=this.roomMenu();
    if(screen==='licenses')content=`${this.back('title')}<h1>Licenses</h1>
      <details class="license-details" open><summary>Drift 68 · MIT License</summary><pre id="game-license"></pre></details>
      <details class="license-details"><summary>Third-party notices</summary><pre id="third-party-notices"></pre></details>`;
    if(screen==='pause')content=`<div class="pause-copy"><h1>A moment<br>to breathe.</h1><p class="intro">${track.name}<br><span>${car.name} · ${this.state.zen?'Zen Drive':'Lap challenge'}</span></p>${pauseShortcuts}<div class="menu-actions">${button('resume','Resume drive',true,'play')}${button('restart','Restart Lap',false,'restart')}${button('garage','Solo setup')}${button('settings','Settings')}${button('title','Exit to Title')}</div><p class="quiet">Your drive is paused. Coding comes first.</p></div>`;
    if(screen==='settings')content=`${this.back(this.returnScreen)}<h1>Make yourself<br>comfortable.</h1><p class="intro">A quieter drive, your way.</p><div class="settings-list">${this.select('quality','Graphics quality',[['auto','Auto · adaptive'],['low','Low · 30 FPS'],['medium','Medium'],['high','High · shadows']])}${this.select('camera','Camera',CAMERA_NAMES.map((name, index) => [String(index), name]))}${this.toggle('sound','Sound','Engine, tires, and small cues')}<label class="setting"><span>Volume</span><input aria-label="Volume" data-setting="volume" type="range" min="0" max="1" step=".05" value="${this.state.settings.volume}"></label>${this.toggle('reducedMotion','Reduced motion','Steadier camera and softer audio')}${this.toggle('minimap','Minimap')}${this.toggle('advancedHud','Lap time & details')}${this.toggle('gamepad','Gamepad','Standard mapping · focus required')}<section class="setting" aria-labelledby="settings-about"><span id="settings-about">About</span><span>Aswin Panengal</span></section></div><button data-action="reset-records" class="text-button danger">Reset local records</button><p class="quiet">Saved in ${this.bridge.standalone ? 'this browser' : 'VS Code'}. No account, no telemetry.</p>`;
    if(screen==='results'&&!this.soloSession){
      const s=this.state,score=Math.floor(s.score.banked),best=Math.max(score,this.data.records[recordKey(s.track,s.car)]?.score??0);
      content=`<div class="results-copy"><h1>That was<br>a good detour.</h1><p class="intro">${track.name} · ${car.name}</p>${this.newRecord?'<p class="record-label">A new personal best</p>':''}<div class="final-score"><strong>${points(score)}</strong><span>drift points</span></div><dl class="results-stats"><div><dt>Personal best</dt><dd>${points(best)}</dd></div><div><dt>Longest drift</dt><dd>${s.score.longest.toFixed(1)} s</dd></div><div><dt>Best multiplier</dt><dd>×${s.score.bestMultiplier.toFixed(1)}</dd></div><div><dt>Lap time</dt><dd>${time(s.lap.elapsed)}</dd></div></dl><div class="menu-actions">${button('retry','One more lap',true)}${button('garage','Change car or circuit')}${button('zen-now','Unwind in Zen Drive')}${button('title','Back to Title')}</div></div>`;
    }
    if(this.soloSession&&screen==='pause')content=this.racePauseMenu();
    if(this.soloSession&&screen==='results'){
      const view=this.multiplayer?.view;
      content=`<div class="results-copy"><h1>${view?.winner===view?.slot?'You won the race':'Your opponent won'}</h1><p class="intro">${track.name} · ${view?.laps} ${view?.laps===1?'lap':'laps'}</p><div class="menu-actions">${button('leave-room','Back to modes',true)}</div></div>`;
    }
    const caption=cover||this.soloSession?'':`<div class="scene-caption"><span>${track.name}</span><small>${track.difficulty+' · '+(this.state.zen?'Zen Drive':'One lap, your own pace')}</small></div>`;
    this.overlay.innerHTML=`<div class="menu-sheet" data-menu="${screen}">${content}</div>${caption}`;
    if(screen==='lobby')this.updateLobbyNotice();
    if(screen==='licenses'){
      this.overlay.querySelector('#game-license')!.textContent=license.trim();
      this.overlay.querySelector('#third-party-notices')!.textContent=notices.trim();
    }
    this.syncMode();this.still();
  }
  private back(action:string):string {return `<button class="back-button" data-action="${action}">${icon('back')}<span>Back</span></button>`;}
  private toggle(key:'sound'|'reducedMotion'|'minimap'|'advancedHud'|'gamepad',label:string,help=''):string {return `<label class="setting"><span>${label}${help?`<small>${help}</small>`:''}</span><input type="checkbox" role="switch" data-setting="${key}" aria-label="${label}" ${this.state.settings[key]?'checked':''}></label>`;}
  private select(key:'quality'|'camera',label:string,options:string[][]):string {return `<label class="setting"><span>${label}</span><select data-setting="${key}" aria-label="${label}">${options.map(([value,text])=>`<option value="${value}" ${String(this.state.settings[key])===value?'selected':''}>${text}</option>`).join('')}</select></label>`;}
  private buildHud():void {
    this.hud.innerHTML=`<div class="score-block" ${this.state.zen?'hidden':''}><span class="hud-label">DRIFT SCORE</span><div><strong id="score">0</strong><span id="combo">×1.0</span></div><small id="pending"></small></div><div class="lap-block"><span class="hud-label">${this.state.zen?'ZEN DRIVE':'LAP 1 / 1'}</span><strong id="lap-time">0:00.0</strong><small id="progress">Checkpoint 0 / 12</small></div><div class="speed-block"><strong id="speed">0</strong><span>km/h</span><div class="boost"><span>BOOST</span><meter id="boost" min="0" max="1" value=".25" aria-label="Boost charge"></meter></div></div><div class="minimap ${this.state.track}"><svg viewBox="-145 -135 290 270" aria-label="Track minimap"><path d="${this.simulation.path.svgPath()}"/><circle id="map-player" r="7"/></svg></div><div class="controls-hint"><span><kbd>W A S D</kbd> drive</span><span><kbd>Space</kbd> drift</span><span><kbd>Shift</kbd> boost</span><span><kbd>Esc</kbd> pause</span></div>`;
    this.hud.querySelector('.lap-block .hud-label')!.id='lap-number';
    this.syncHudOptions();
  }
  private syncHudOptions():void {
    this.hud.classList.toggle('simple',!this.state.settings.advancedHud);
    this.hud.classList.toggle('no-map',!this.state.settings.minimap);
  }
  private updateHud():void {
    if(this.hud.hidden)return;const s=this.state;
    const set=(id:string,value:string)=>{const el=this.hud.querySelector('#'+id);if(el&&el.textContent!==value)el.textContent=value;};
    set('score',points(s.score.banked+s.score.pending));set('combo',`×${s.score.multiplier.toFixed(1)}`);set('pending',s.score.pending>0?`+${points(s.score.pending)} in this combo`:s.zen?'':'Find your flow');
    if(this.racePrepared){
      const total=s.lap.total??1;
      set('lap-number',`LAP ${Math.min(total,(s.lap.completed??0)+1)} / ${total}`);
    }
    set('speed',String(Math.round(Math.hypot(s.vehicle.vx,s.vehicle.vz)*3.6)));set('lap-time',time(s.lap.elapsed));set('progress',s.zen?'No finish. No hurry.':`Checkpoint ${s.lap.next-1} / 12`);
    const boost=this.hud.querySelector<HTMLMeterElement>('#boost');if(boost)boost.value=s.vehicle.boost;
    const player=this.hud.querySelector('#map-player');player?.setAttribute('cx',s.vehicle.x.toFixed(1));player?.setAttribute('cy',s.vehicle.z.toFixed(1));
    this.hud.classList.toggle('drifting',s.score.active);
  }
  private click=(event:MouseEvent):void=>{
    const target=event.target as HTMLElement,control=target.closest<HTMLElement>('[data-action]');
    if(!control){if(!this.soloSession&&this.state.screen==='drive'&&this.lease)this.start();return;}
    void this.audio.playCue(this.state.settings);
    const action=control.dataset.action;
    if(this.root.dataset.screen==='idle'&&(action==='play'||action==='settings'||action==='licenses')){
      this.titleDestination=action==='play'?'modes':action;
      this.root.setAttribute('aria-busy','true');
      this.overlay.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.disabled=true;});
      this.bridge.post({type:'claim'});
      return;
    }
    if(action==='expand'){this.pause();this.capture();this.bridge.post({type:'openEditor'});return;}
    if(action==='sidebar'){this.pause();this.capture();this.bridge.post({type:'openSidebar'});return;}
    if(action==='maximize'){this.pause();this.bridge.post({type:'maximize'});return;}
    if(action==='retry-graphics'){if(this.lease)this.show(this.state.screen,true);else this.bridge.post({type:'claim'});return;}
    if(!this.lease)return;
    if(this.soloSession){
      if(action==='leave-room')this.leaveLobby();
      if(action==='create-room'&&this.roomServer)this.connectRoom('create',newRoomIdentity(this.state.car),{track:this.roomTrack,laps:this.roomLaps});
      if(action==='join-room')this.joinRoom();
      if(action==='start-race')this.multiplayer?.command('start');
      if(action==='race-ready')this.readyRace();
      if(action==='pause')this.pause();
      return;
    }
    if(action==='play'){
      this.show('modes');this.capture();
      this.overlay.querySelector<HTMLButtonElement>('[data-action="start-flow"]')?.focus({preventScroll:true});
      return;
    }
    if(action==='multiplayer'&&this.state.screen==='modes'){this.openLobby();return;}
    if(action==='start-flow')this.state.zen=false;
    if(action==='start-flow'||action==='garage'){
      this.show('garage',true);
      this.overlay.querySelector<HTMLElement>('[data-picker="car"]')?.focus({preventScroll:true});
      this.capture();
      return;
    }
    if(this.state.screen==='garage'){
      if(action==='previous-car'||action==='next-car'){this.cycleSetup('car',action==='next-car'?1:-1);return;}
      if(action==='previous-track'||action==='next-track'){this.cycleSetup('track',action==='next-track'?1:-1);return;}
      if(action==='zen'||action==='challenge'){
        this.state.zen=action==='zen';this.persist();this.updateSetup();return;
      }
    }
    if(action==='begin')this.persist();
    if(action==='begin'||action==='retry'||action==='restart'){this.stop();this.beginDrive();return;}
    if(action==='resume'){this.start();return;}
    if(action==='pause'){if(this.active)this.pause();else if(this.state.screen!=='pause')this.show('pause');return;}
    if(action==='zen-now'){this.state.zen=true;this.persist();this.beginDrive();return;}
    if(action==='reset-records'){this.bridge.post({type:'resetRecords'});return;}
    if(action==='settings'){this.returnScreen=this.state.screen==='drive'?'pause':this.state.screen;this.show('settings');return;}
    if(action==='title'||action==='modes'||action==='licenses'||action==='pause'){
      this.show(action);this.capture();
    }
  };
  private change=(event:Event):void=>{
    const element=event.target as HTMLInputElement|HTMLSelectElement;
    if(element.dataset.roomSetting==='track'&&roomTrack(element.value))this.roomTrack=element.value;
    if(element.dataset.roomSetting==='laps'){
      const laps=Number(element.value);
      if(roomLaps(laps))this.roomLaps=laps;
    }
    const key=element.dataset.setting;if(!key)return;
    const settings=this.state.settings;
    if(key==='quality')settings.quality=element.value as typeof settings.quality;
    else if(key==='volume')settings.volume=Number(element.value);
    else if(key==='camera')settings.camera=Number(element.value);
    else if(['sound','reducedMotion','minimap','advancedHud','gamepad'].includes(key)){(settings as unknown as Record<string,unknown>)[key]=(element as HTMLInputElement).checked;}
    if(key==='sound'){
      if(settings.sound)this.audio.playCue(settings);
      else this.audio.stop(true);
    }
    this.root.classList.toggle('reduced-motion',settings.reducedMotion);this.persist();this.still();
  };
  private menuKeys=(event:KeyboardEvent):void=>{
    if(event.defaultPrevented||this.state.screen==='drive'||event.ctrlKey||event.altKey||event.metaKey)return;
    if(this.soloSession){
      if(this.lease&&event.code==='Enter'&&(event.target as HTMLElement).id==='room-code'){event.preventDefault();this.joinRoom();}
      if(this.lease&&event.code==='Escape'&&this.state.screen==='lobby'){event.preventDefault();this.leaveLobby();}
      return;
    }
    if(this.lease&&this.state.screen==='garage'){
      const picker=(event.target as HTMLElement).closest<HTMLElement>('[data-picker]')?.dataset.picker;
      if(picker==='car'||picker==='track'){
        if(event.code==='ArrowLeft'||event.code==='ArrowRight'){
          event.preventDefault();
          this.cycleSetup(picker,event.code==='ArrowRight'?1:-1);
          return;
        }
        if(event.code==='ArrowUp'||event.code==='ArrowDown'){
          event.preventDefault();
          const next=event.code==='ArrowDown'?'track':'car';
          this.overlay.querySelector<HTMLElement>(`[data-picker="${next}"]`)?.focus();
          return;
        }
      }
    }
    if(event.code==='Escape'&&this.lease){
      event.preventDefault();
      if(this.state.screen==='pause'){this.show('drive');this.root.focus();}
      else if(this.state.screen==='settings')this.show(this.returnScreen);
      else if(this.state.screen==='garage')this.show('modes');
      else this.show('title');
    }
  };
  private toast(message:string):void {clearTimeout(this.toastTimer);const element=this.root.querySelector('#toast')!;element.textContent=message;if(message)this.toastTimer=window.setTimeout(()=>{element.textContent='';},3500);}
  private showError(): void {
    this.stop();
    this.restoreSceneRoot();
    this.overlay.hidden = false;
    this.hud.hidden = true;
    this.overlay.innerHTML = `<div class="welcome"><h1>A little<br>pit stop.</h1><p id="error-message"></p>${button('retry-graphics','Try again',true)}${button('expand','Open in editor')}</div>`;
    const platform = this.bridge.standalone ? 'your browser' : 'VS Code';
    this.overlay.querySelector('#error-message')!.textContent = this.error || `WebGL is unavailable. Enable hardware acceleration in ${platform}, then try again.`;
  }
  private pagehide=():void=>{this.pause();this.capture();this.multiplayer?.dispose(false);this.disposeRenderer();this.audio.dispose();};
  dispose():void {clearTimeout(this.toastTimer);this.pagehide();this.loop.stop();this.input.dispose();this.bridge.dispose();this.root.removeEventListener('click',this.click);this.root.removeEventListener('change',this.change);this.root.removeEventListener('keydown',this.menuKeys);window.removeEventListener('pagehide',this.pagehide);}
}
