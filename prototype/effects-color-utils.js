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
      params:{exposure:0,contrast:1,saturation:1,temperature:0,tint:0}
    },
    blur:{id:'blur',type:'blur',enabled:false,params:{radius:0}},
    sharpen:{id:'sharpen',type:'sharpen',enabled:false,params:{amount:0}},
    vignette:{id:'vignette',type:'vignette',enabled:false,params:{amount:0}}
  };

  const RANGES={
    color:{exposure:[-4,4],contrast:[.25,4],saturation:[0,4],temperature:[-100,100],tint:[-100,100]},
    blur:{radius:[0,50]},
    sharpen:{amount:[0,3]},
    vignette:{amount:[0,1]}
  };

  function sanitizeParam(type,param,value){
    const range=RANGES[type]?.[param];
    const fallback=SPECS[type]?.params?.[param]??0;
    return range?clamp(value,range[0],range[1]):Number.isFinite(Number(value))?Number(value):fallback;
  }

  function normalizedEffect(effect,type){
    const spec=SPECS[type];
    if(!spec)return clone(effect||{});
    const params={...spec.params};
    for(const key of Object.keys(params))params[key]=sanitizeParam(type,key,effect?.params?.[key]??params[key]);
    const meaningful=type==='color'||Object.entries(params).some(([key,value])=>Math.abs(value-(spec.params[key]??0))>1e-9);
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
      const defaultValue=SPECS[type].params[param]??0;
      const hasValue=Object.entries(effect.params).some(([key,current])=>Math.abs(current-(SPECS[type].params[key]??0))>1e-9);
      effect.enabled=options.enabled!==undefined?Boolean(options.enabled):(hasValue||Math.abs(effect.params[param]-defaultValue)>1e-9);
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

  function resetClipEffects(timeline,clipId){
    const next=clone(timeline||{tracks:[]});
    const found=findClip(next,clipId);
    if(!found)return next;
    const extras=(Array.isArray(found.clip.effects)?found.clip.effects:[]).filter(effect=>!SPECS[effect?.type]).map(clone);
    found.clip.effects=[
      normalizedEffect(null,'color'),normalizedEffect(null,'blur'),normalizedEffect(null,'sharpen'),normalizedEffect(null,'vignette'),...extras
    ];
    return next;
  }

  function hasVisualEffects(clip){
    const effects=normalizeEffects(clip);
    const color=effects.find(effect=>effect.type==='color');
    const colorChanged=color&&color.enabled&&Object.entries(color.params).some(([key,value])=>Math.abs(value-SPECS.color.params[key])>1e-9);
    return Boolean(colorChanged||effects.some(effect=>effect.type!=='color'&&effect.enabled));
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
    }
    for(const type of ['blur','sharpen','vignette']){
      const effect=effects.find(item=>item.type===type);
      if(effect?.enabled)parts.push(type[0].toUpperCase()+type.slice(1));
    }
    return parts;
  }

  return{SPECS,RANGES,clamp,sanitizeParam,normalizeEffects,getEffect,findClip,setEffectParam,setEffectEnabled,resetClipEffects,hasVisualEffects,effectSummary};
});
