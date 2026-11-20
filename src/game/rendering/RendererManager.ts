import * as T from 'three';
import { REAR_CHASE_CAMERA, type Snapshot, type DisplayMode, type Settings, type VehicleState } from '../../shared/types';
import { CARS } from '../vehicle/CarConfigs';
import { tireSlip } from '../vehicle/VehiclePhysics';
import { TrackPath } from '../tracks/TrackConfigs';
import { createCar,type CarModel } from './VehicleFactory';
import { createEnvironment,disposeScene } from './EnvironmentFactory';
import { EffectsManager } from './EffectsManager';
export class RendererManager {
  readonly renderer:T.WebGLRenderer;
  readonly scene=new T.Scene();readonly camera=new T.OrthographicCamera(-45,45,30,-30,.1,900);
  private readonly rearCamera = new T.PerspectiveCamera(54, 1, .2, 650);
  activeCamera: T.OrthographicCamera | T.PerspectiveCamera = this.camera;
  private readonly rearAnchor = new T.Vector3();
  private rearHeading = 0;
  car!:CarModel;effects?:EffectsManager;private content=new T.Group();private sun:T.DirectionalLight;
  private target=new T.Vector3();private desired=new T.Vector3();private offset=new T.Vector3();
  private observer:ResizeObserver;private settings:Settings;private mode:DisplayMode;
  private garage=false;private initialized=false;private width=1;private height=1;private slow=0;private qualityScale=1;
  contextLost=false;
  constructor(private container:HTMLElement,settings:Settings,mode:DisplayMode,private readonly onLost:()=>void,private readonly onRestored:()=>void){
    this.settings=settings;this.mode=mode;
    this.renderer=new T.WebGLRenderer({antialias:settings.quality==='high'&&mode!=='sidebar',alpha:false,powerPreference:'low-power'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    this.renderer.shadowMap.type=T.PCFShadowMap;
    const canvas=this.renderer.domElement;canvas.setAttribute('aria-label','3D driving scene');container.prepend(canvas);
    canvas.addEventListener('webglcontextlost',this.lost);canvas.addEventListener('webglcontextrestored',this.restored);
    this.scene.add(new T.HemisphereLight('#e4efeb','#7d7961',.9));
    this.sun=new T.DirectionalLight('#fff0d1',1.8);this.sun.position.set(60,110,40);this.sun.shadow.mapSize.set(1024,1024);this.sun.shadow.camera.left=-35;this.sun.shadow.camera.right=35;this.sun.shadow.camera.top=35;this.sun.shadow.camera.bottom=-35;this.sun.shadow.camera.far=200;this.sun.shadow.normalBias=.08;
    this.scene.add(this.sun,this.sun.target,this.content);
    this.observer=new ResizeObserver(()=>{this.resize();this.onRestored();});this.observer.observe(container);this.resize();
  }
  private lost=(event:Event):void=>{event.preventDefault();this.contextLost=true;this.onLost();};
  private restored=():void=>{this.contextLost=false;this.onRestored();};
  configure(settings:Settings,mode:DisplayMode):void {this.settings=settings;this.mode=mode;this.resize();}
  load(state:Snapshot,path:TrackPath,garage=false):void {
    disposeScene(this.content);this.effects=undefined;this.garage=garage;
    this.scene.background=new T.Color(garage?'#aebdb0':path.config.sky);
    this.scene.fog=new T.Fog(garage?'#aebdb0':path.config.fog,garage?60:180,garage?130:510);
    this.sun.color.set(path.config.sun);
    const carConfig = CARS[state.car];
    this.car=createCar(carConfig);
    if(garage){
      const floor=new T.Mesh(new T.PlaneGeometry(250,250),new T.MeshLambertMaterial({color:'#9ba991'}));floor.rotation.x=-Math.PI/2;floor.position.y=-.1;floor.receiveShadow=true;this.content.add(floor);
      const pad=new T.Mesh(new T.CylinderGeometry(4.4,4.6,.22,48),new T.MeshLambertMaterial({color:'#bfc1aa'}));pad.position.y=0;pad.receiveShadow=true;this.content.add(pad);
      const ring=new T.Mesh(new T.RingGeometry(4.8,4.83,64),new T.MeshBasicMaterial({color:'#d9d7bd'}));ring.rotation.x=-Math.PI/2;ring.position.y=.02;this.content.add(ring);
      this.car.group.position.set(0,.12,0);this.car.group.rotation.y=-.45;
    }else{this.content.add(createEnvironment(path));this.effects=new EffectsManager(carConfig);this.content.add(this.effects.group);this.car.update(state.vehicle,0,true);}
    this.content.add(this.car.group);this.initialized=false;this.resize();this.draw(state,0,true);
  }
  private resize():void {
    this.width=Math.max(1,this.container.clientWidth);this.height=Math.max(1,this.container.clientHeight);
    const quality=this.settings.quality,compact=this.mode==='sidebar';
    const ratio=compact?.85:quality==='low'?.85:quality==='medium'?1:quality==='high'?1.5:1.15;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,ratio)*this.qualityScale);
    this.renderer.setSize(this.width,this.height,false);
    this.renderer.shadowMap.enabled=!compact&&quality==='high';this.sun.castShadow=this.renderer.shadowMap.enabled;
    const aspect=this.width/this.height,span=this.garage?(aspect<.8?21:15):Math.max(57,38/aspect);
    this.camera.left=-span*aspect/2;this.camera.right=span*aspect/2;this.camera.top=span/2;this.camera.bottom=-span/2;this.camera.updateProjectionMatrix();
    this.rearCamera.aspect = aspect;
    this.rearCamera.fov = aspect < .65 ? 60 : 54;
    this.rearCamera.updateProjectionMatrix();
  }
  resetTracking(): void {
    this.initialized = false;
    this.effects?.breakTrail();
  }
  private aimRearCamera(vehicle: VehicleState, dt: number, still: boolean, reducedMotion: boolean): void {
    // Follow a heading between the chassis and the velocity so the camera does not whip across a slide.
    const heading = vehicle.heading + Math.min(.65, Math.max(-.65, vehicle.driftAngle)) * (reducedMotion ? .8 : .55);
    this.desired.set(vehicle.x, 0, vehicle.z);
    if (!this.initialized || still || this.activeCamera !== this.rearCamera) {
      this.rearHeading = heading;
      this.rearAnchor.copy(this.desired);
    } else {
      const delta = heading - this.rearHeading;
      const shortestTurn = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.rearHeading += shortestTurn * (1 - Math.exp(-(reducedMotion ? 3.8 : 6) * dt));
      this.rearAnchor.lerp(this.desired, 1 - Math.exp(-13 * dt));
    }
    const x = Math.sin(this.rearHeading);
    const z = Math.cos(this.rearHeading);
    const distance = this.rearCamera.aspect < .65 ? 13.5 : 12;
    this.rearCamera.position.set(this.rearAnchor.x - x * distance, 6.2, this.rearAnchor.z - z * distance);
    this.target.set(this.rearAnchor.x + x * 7.5, 1.15, this.rearAnchor.z + z * 7.5);
    this.rearCamera.lookAt(this.target);
    this.activeCamera = this.rearCamera;
  }
  draw(state:Snapshot,dt:number,still=false):void {
    if(this.contextLost)return;
    const v=state.vehicle,menu=state.screen!=='drive'&&state.screen!=='pause'&&state.screen!=='results';
    const aspect=this.width/this.height;
    const rearView = !this.garage && !menu && state.settings.camera === REAR_CHASE_CAMERA;
    const overview=!this.garage&&(state.screen==='title'||state.screen==='circuits');
    const zoom=overview?.48:1;
    if(this.camera.zoom!==zoom){this.camera.zoom=zoom;this.camera.updateProjectionMatrix();}
    if(this.garage){
      this.target.set(aspect>1? -3.2:0,1,aspect>1?2:0);this.offset.set(10,8,13);
    }else if (rearView) {
      this.aimRearCamera(v, dt, still, state.settings.reducedMotion);
    }else{
      this.desired.set(v.x+v.vx*.4,0,v.z+v.vz*.4);
      if(menu&&aspect>1){this.desired.x-=15;this.desired.z+=9;}
      if(state.screen==='title'&&aspect>1){
        if(state.track==='coastal')this.desired.set(-95,0,115);
        else if(state.track==='alpine')this.desired.set(0,0,-95);
        else this.desired.set(70,0,90);
      }
      if(!this.initialized||still||this.activeCamera!==this.camera||state.settings.reducedMotion)this.target.copy(this.desired);else this.target.lerp(this.desired,1-Math.exp(-4*dt));
      const camera=state.settings.camera;
      this.offset.set(camera===1?17:camera===2?2:26,camera===1?29:camera===2?65:43,camera===1?26:camera===2?7:34);
    }
    if (!rearView) {
      this.camera.position.copy(this.target).add(this.offset);
      this.camera.lookAt(this.target);
      this.activeCamera = this.camera;
    }
    if (!this.garage) {
      this.car.update(v, dt, state.settings.reducedMotion);
      if (!still) {
        const low = this.mode === 'sidebar' || this.settings.quality === 'low' || this.settings.reducedMotion;
        this.effects?.update(v, tireSlip(v), Math.min(dt, .12), low);
      }
      this.effects?.setViewportHeight(this.renderer.domElement.height);
    }
    this.initialized = true;
    this.sun.position.set(this.target.x+50,100,this.target.z+35);this.sun.target.position.copy(this.target);
    const start=performance.now();this.renderer.render(this.scene,this.activeCamera);const cost=performance.now()-start;
    if(this.settings.quality==='auto'&&!still){this.slow=cost>24||dt>.05?this.slow+1:Math.max(0,this.slow-1);if(this.slow>35&&this.qualityScale>.61){this.qualityScale=Math.max(.6,this.qualityScale-.1);this.slow=0;this.resize();}}
  }
  diagnostics():object {return {calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,resolution:[this.renderer.domElement.width,this.renderer.domElement.height],contextLost:this.contextLost};}
  dispose():void {this.observer.disconnect();const canvas=this.renderer.domElement;canvas.removeEventListener('webglcontextlost',this.lost);canvas.removeEventListener('webglcontextrestored',this.restored);disposeScene(this.content);this.sun.shadow.map?.dispose();this.renderer.renderLists.dispose();this.renderer.dispose();this.renderer.forceContextLoss();canvas.remove();}
}
