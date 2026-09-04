(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DirectorEffectsColor=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clone=value=>JSON.parse(JSON.stringify(value));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):min));

  const SPECS={
    color:{
      id:'color',type:'color',enabled:true,
      params:{exposure:0,contrast:1,saturation:1,temperature:0,tint:0,highlights:0,shadows:0}
    },
    blur:{id:'blur',type:'blur',enabled:false,params:{radius:0}},
    sharpen:{id:'sharpen',type:'sharpen',enabled:false,params:{amount:0}},
    vignette:{id:'vignette',type:'vignette',enabled:false,params:{amount:0}},
    motionBlur:{id:'motion-blur',type:'motionBlur',enabled:false,params:{amount:0}},
    lut:{id:'lut',type:'lut',enabled:false,params:{path:''}}
  };

  const RANGES={
    color:{exposure:[-4,4],contrast:[.25,4],saturation:[0,4],temperature:[-100,100],tint:[-100,100],highlights:[-100,100],shadows:[-100,100]},
    blur:{radius:[0,50]},
    sharpen:{amount:[0,3]},
    vignette:{amount:[0,1]},
    motionBlur:{amount:[0,1]},
    lut:{}
  };

  function sanitizeParam(type,param,value){
    const fallback=SPECS[type]?.params?.[param]??0;
    if(typeof fallback==='string')return String(value??fallback);
    const range=RANGES[type]?.[param];
    return range?clamp(value,range[0],range[1]):Number.isFinite(Number(value))?Number(value):fallback;
  }

  function paramChanged(type,param,value){
    const fallback=SPECS[type]?.params?.[param];
    if(typeof fallback==='string')return String(value??'')!==fallback;
    return Math.abs(Number(value??fallback)-Number(fallback??0))>1e-9;
  }

  function normalizedEffect(effect,type){
    const spec=SPECS[type];
    if(!spec)return clone(effect||{});
    const params={...spec.params};
    for(const key of Object.keys(params))params[key]=sanitizeParam(type,key,effect?.params?.[key]??params[key]);
    const meaningful=type==='color'||Object.entries(params).some(([key,value])=>paramChanged(type,key,value));
    return{
      id:String(effect?.id||spec.id),
      type,
      enabled:type==='color'?(effect?.enabled!==false):Boolean(effect?.enabled??meaningful),
      params
    };
  }

  function normalizeEffects(clip={}){
    const input=Array.isArray(clip.effects)?clip.effects:[];
    const known=new Map();
    const extras=[];
    for(const effect of input){
      const type=String(effect?.type||'');
      if(SPECS[type]&&!known.has(type))known.set(type,effect);
      else if(effect&&type)extras.push(clone(effect));
    }
    return[
      normalizedEffect(known.get('color'),'color'),
      normalizedEffect(known.get('blur'),'blur'),
      normalizedEffect(known.get('sharpen'),'sharpen'),
      normalizedEffect(known.get('vignette'),'vignette'),
      normalizedEffect(known.get('motionBlur'),'motionBlur'),
      normalizedEffect(known.get('lut'),'lut'),
      ...extras
    ];
  }

  function getEffect(clip,type){
    return normalizeEffects(clip).find(effect=>effect.type===type)||null;
  }

  function findClip(timeline,clipId){
    for(const track of timeline?.tracks||[]){
      const index=(track.clips||[]).findIndex(clip=>clip.id===clipId);
      if(index>=0)return{track,clip:track.clips[index],index};
    }
    return null;
  }

  function setEffectParam(timeline,clipId,type,param,value,options={}){
    const next=clone(timeline||{tracks:[]});
    const found=findClip(next,clipId);
    if(!found||!SPECS[type]||!(param in SPECS[type].params))return next;
    const effects=normalizeEffects(found.clip);
    const effect=effects.find(item=>item.type===type);
    effect.params[param]=sanitizeParam(type,param,value);
    if(type==='color')effect.enabled=options.enabled!==undefined?Boolean(options.enabled):true;
    else{
      const meaningful=Object.entries(effect.params).some(([key,current])=>paramChanged(type,key,current));
      effect.enabled=options.enabled!==undefined?Boolean(options.enabled):meaningful;
    }
    found.clip.effects=effects;
    return next;
  }

  function setEffectEnabled(timeline,clipId,type,enabled){
    const next=clone(timeline||{tracks:[]});
    const found=findClip(next,clipId);
    if(!found||!SPECS[type])return next;
    const effects=normalizeEffects(found.clip);
    const effect=effects.find(item=>item.type===type);
    effect.enabled=Boolean(enabled);
    found.clip.effects=effects;
    return next;
  }

  function resetEffect(timeline,clipId,type){
    const next=clone(timeline||{tracks:[]});
    const found=findClip(next,clipId);
    if(!found||!SPECS[type])return next;
    const effects=normalizeEffects(found.clip);
    const index=effects.findIndex(item=>item.type===type);
    if(index>=0)effects[index]=normalizedEffect(null,type);
    found.clip.effects=effects;
    return next;
  }

  function resetClipEffects(timeline,clipId){
    const next=clone(timeline||{tracks:[]});
    const found=findClip(next,clipId);
    if(!found)return next;
    const extras=(Array.isArray(found.clip.effects)?found.clip.effects:[]).filter(effect=>!SPECS[effect?.type]).map(clone);
    found.clip.effects=[
      normalizedEffect(null,'color'),normalizedEffect(null,'blur'),normalizedEffect(null,'sharpen'),normalizedEffect(null,'vignette'),normalizedEffect(null,'motionBlur'),normalizedEffect(null,'lut'),...extras
    ];
    return next;
  }

  function hasVisualEffects(clip){
    const effects=normalizeEffects(clip);
    const color=effects.find(effect=>effect.type==='color');
    const colorChanged=color&&color.enabled&&Object.entries(color.params).some(([key,value])=>paramChanged('color',key,value));
    return Boolean(colorChanged||effects.some(effect=>effect.type!=='color'&&effect.enabled&&Object.entries(effect.params||{}).some(([key,value])=>paramChanged(effect.type,key,value))));
  }

  function shortPath(value){
    const parts=String(value||'').split(/[\\/]/).filter(Boolean);
    return parts[parts.length-1]||'';
  }

  function effectSummary(clip){
    const effects=normalizeEffects(clip),parts=[];
    const color=effects.find(effect=>effect.type==='color');
    if(color?.enabled){
      if(Math.abs(color.params.exposure)>1e-9)parts.push(`Exposure ${color.params.exposure>0?'+':''}${color.params.exposure.toFixed(1)}`);
      if(Math.abs(color.params.contrast-1)>1e-9)parts.push(`Contrast ${Math.round(color.params.contrast*100)}%`);
      if(Math.abs(color.params.saturation-1)>1e-9)parts.push(`Saturation ${Math.round(color.params.saturation*100)}%`);
      if(Math.abs(color.params.temperature)>1e-9)parts.push(`Temp ${Math.round(color.params.temperature)}`);
      if(Math.abs(color.params.tint)>1e-9)parts.push(`Tint ${Math.round(color.params.tint)}`);
      if(Math.abs(color.params.highlights)>1e-9)parts.push(`Highlights ${Math.round(color.params.highlights)}`);
      if(Math.abs(color.params.shadows)>1e-9)parts.push(`Shadows ${Math.round(color.params.shadows)}`);
    }
    for(const type of ['blur','sharpen','vignette','motionBlur']){
      const effect=effects.find(item=>item.type===type);
      if(effect?.enabled)parts.push(type==='motionBlur'?'Motion Blur':type[0].toUpperCase()+type.slice(1));
    }
    const lut=effects.find(item=>item.type==='lut');
    if(lut?.enabled&&lut.params.path)parts.push(`LUT ${shortPath(lut.params.path)}`);
    return parts;
  }

  return{SPECS,RANGES,clamp,sanitizeParam,paramChanged,normalizeEffects,getEffect,findClip,setEffectParam,setEffectEnabled,resetEffect,resetClipEffects,hasVisualEffects,effectSummary,shortPath};
});
