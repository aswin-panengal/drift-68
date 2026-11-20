"""Original vector mark and deterministic raster extension icon; Pillow is build-time only."""
from pathlib import Path
from PIL import Image,ImageDraw
Path('media').mkdir(exist_ok=True)
svg='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M10 55C47 43 14 34 37 23 53 16 51 9 50 6M23 57C60 43 28 34 49 24 62 16 61 9 60 6" fill="none" stroke="#e8bb56" stroke-width="3" stroke-linecap="round"/><path d="M16 56l6-2m9-6 3-3m-3-8-2-3m4-6 4-2m9-6 4-2m5-7V7" fill="none" stroke="#f7f3e8" stroke-width="1.5" stroke-linecap="round"/></svg>'''
Path('media/drift.svg').write_text(svg,encoding='utf-8')
scale=4
im=Image.new('RGBA',(128*scale,128*scale),'#202a28');d=ImageDraw.Draw(im)
def line(points,color,width):d.line([(int(x*scale),int(y*scale)) for x,y in points],fill=color,width=int(width*scale),joint='curve')
def bezier(p0,p1,p2,p3):
 return [tuple((1-t)**3*p0[k]+3*(1-t)**2*t*p1[k]+3*(1-t)*t*t*p2[k]+t**3*p3[k] for k in range(2)) for t in [i/60 for i in range(61)]]
road=bezier((13,122),(114,84),(8,74),(74,38))+bezier((74,38),(100,21),(107,15),(103,-5))
line(road,'#f7f3e8',28);line(road,'#56665b',23)
for i in range(0,len(road)-5,12):line(road[i:i+5],'#e8bb56',1.5)
car=Image.new('RGBA',(23*scale,42*scale));cd=ImageDraw.Draw(car)
cd.rounded_rectangle((2*scale,scale,21*scale,41*scale),radius=5*scale,fill='#e8bb56')
cd.polygon([(5*scale,12*scale),(18*scale,12*scale),(19*scale,20*scale),(4*scale,20*scale)],fill='#314c54')
cd.rectangle((5*scale,22*scale,18*scale,31*scale),fill='#d6a541')
cd.rectangle((4*scale,33*scale,19*scale,36*scale),fill='#314c54')
car=car.rotate(-36,resample=Image.Resampling.BICUBIC,expand=True);im.alpha_composite(car,(46*scale,46*scale))
im.resize((128,128),Image.Resampling.LANCZOS).convert('RGB').save('media/icon.png')
