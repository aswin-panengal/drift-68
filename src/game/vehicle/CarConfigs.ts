import type { CarId } from '../../shared/types';
export interface CarConfig {
  id: CarId; name: string; color: string; description: string; personality: string;
  acceleration: number; response: number; steering: number; traction: number; driftGrip: number; yawDamping: number; braking: number; boost: number;
  length: number; width: number; power: number; handling: number; drift: number;
}
export const CARS: Record<CarId,CarConfig> = {
  rearwind: { id:'rearwind',name:'Rearwind 84',color:'#e8bb56',description:'A little golden coupe with a light nose and a playful rear. Your everyday escape.',personality:'Balanced · playful',acceleration:14,response:6,steering:1.15,traction:5.8,driftGrip:1.15,yawDamping:4.8,braking:24,boost:12,length:4.2,width:1.95,power:3,handling:4,drift:3 },
  ironback: { id:'ironback',name:'Ironback V8',color:'#cb6a3c',description:'Long hood. Wide shoulders. Take your time and let the torque draw the corner.',personality:'Heavy · sweeping',acceleration:16,response:3.6,steering:.98,traction:5.1,driftGrip:.9,yawDamping:3.8,braking:22,boost:13,length:5,width:2.15,power:5,handling:2,drift:4 },
  streetline: { id:'streetline',name:'Streetline S',color:'#3e6b95',description:'A nimble blue coupe made for linking corners. A small wing, a little more attitude.',personality:'Light · lively',acceleration:14.8,response:8,steering:1.28,traction:5.3,driftGrip:1,yawDamping:5.5,braking:25,boost:12,length:4.35,width:1.95,power:4,handling:5,drift:5 },
  solace: { id:'solace',name:'Solace GT',color:'#deded3',description:'A quiet grand tourer that finds its line. Smooth inputs, clean exits, easy company.',personality:'Stable · forgiving',acceleration:13.5,response:5.5,steering:1.06,traction:7.2,driftGrip:1.65,yawDamping:6,braking:28,boost:11,length:4.7,width:2.08,power:3,handling:5,drift:2 },
};
