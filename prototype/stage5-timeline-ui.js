// Professional timeline interaction refinements: frame trims, track controls, scrubbing, snapping and keyboard shortcuts.
(() => {
  if (!window.DirectorTimeline) return;

  state.trimDrag = null;

  function timelineTotal() { return Math.max(state.duration || 0, TL.duration(state.timeline), 1); }
  function shiftKeyframesForLeftTrim(keyframes, delta, newDuration) {
    const out = {};
    for (const [property, frames] of Object.entries(keyframes || {})) {
      const next = [];
      for (const frame of frames || []) {
        const time = Number(frame.time || 0) - delta;
        if (time >= -1e-6 && time <= newDuration + 1e-6) next.push({ ...frame, time:Math.max(0,frameSnap(time)) });
      }
      if (next.length) out[property] = next;
    }
    return out;
  }
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

  function trimOne(timeline, clipId, side, delta) {
    const found = TL.findClip(timeline,clipId); if (!found || found.track.locked) return timeline;
    const c = found.clip, frame = TL.frameDuration(timeline.fps), dRaw = TL.snapDelta(delta,timeline.fps);
    if (side === 'left') {
      const minDelta = -Math.min(c.sourceIn,c.start), maxDelta = Math.max(0,c.duration-frame), d = clamp(dRaw,minDelta,maxDelta);
      if (Math.abs(d)<1e-8) return timeline;
      const newDuration = TL.snapTime(c.duration-d,timeline.fps);
      c.start = TL.snapTime(c.start+d,timeline.fps);
      c.sourceIn = TL.snapTime(c.sourceIn+d,timeline.fps);
      c.duration = newDuration;
      c.keyframes = shiftKeyframesForLeftTrim(c.keyframes,d,newDuration);
    } else {
      const minDelta = -(c.duration-frame), maxDelta = Math.max(0,c.sourceDuration-(c.sourceIn+c.duration)), d = clamp(dRaw,minDelta,maxDelta);
      if (Math.abs(d)<1e-8) return timeline;
      c.duration = TL.snapTime(c.duration+d,timeline.fps);
      for (const property of Object.keys(c.keyframes||{})) c.keyframes[property]=(c.keyframes[property]||[]).filter(k=>k.time<=c.duration+1e-6);
    }
    found.track.clips.sort((a,b)=>a.start-b.start);
    return timeline;
  }

  function trimLinked(base,clipId,side,delta){
    let timeline=TL.normalizeTimeline(base);const f=TL.findClip(timeline,clipId);if(!f)return timeline;const linked=f.clip.linkedId;
    timeline=trimOne(timeline,clipId,side,delta);if(linked)timeline=trimOne(timeline,linked,side,delta);return timeline;
  }

  function decorateTrackControls(){
    $$('.track').forEach((row,i)=>{
      const track=state.timeline.tracks[i],label=row.querySelector('.trackLabel');if(!track||!label)return;
      const old=label.querySelector('.trackControls');if(old)old.remove();
      const controls=document.createElement('div');controls.className='trackControls';
      const lock=document.createElement('button');lock.textContent=track.locked?'🔒':'🔓';lock.title=track.locked?'Unlock track':'Lock track';
      lock.onclick=e=>{e.stopPropagation();track.locked=!track.locked;markDirty();renderTimeline()};controls.appendChild(lock);
      if(track.kind==='audio'){
        const mute=document.createElement('button');mute.textContent=track.muted?'M×':'M';mute.classList.toggle('active',track.muted);mute.title='Mute track';mute.onclick=e=>{e.stopPropagation();track.muted=!track.muted;markDirty();renderTimeline()};controls.appendChild(mute);
      } else if(track.kind==='video'||track.kind==='graphic'){
        const eye=document.createElement('button');eye.textContent=track.hidden?'○':'◉';eye.title=track.hidden?'Show track':'Hide track';eye.onclick=e=>{e.stopPropagation();track.hidden=!track.hidden;markDirty();renderTimeline()};controls.appendChild(eye);
      }
      label.appendChild(controls);
    });
  }

  function decorateTrimHandles(){
    $$('.clip[data-clip-id]').forEach(el=>{
      if(el.querySelector('.trimHandle'))return;
      for(const side of ['left','right']){
        const h=document.createElement('div');h.className=`trimHandle ${side}`;h.title=`Trim ${side} edge`;
        h.onpointerdown=ev=>{
          if(ev.button!==0)return;ev.preventDefault();ev.stopPropagation();
          const lane=el.closest('.lane'),clipId=el.dataset.clipId,found=TL.findClip(state.timeline,clipId);if(!lane||!found||found.track.locked)return;
          state.trimDrag={clipId,side,startX:ev.clientX,width:Math.max(1,lane.getBoundingClientRect().width),total:timelineTotal(),base:JSON.parse(JSON.stringify(state.timeline)),before:snapshot()};
          state.drag=null;
        };
        el.appendChild(h);
      }
    });
  }

  const baseRenderTimeline=renderTimeline;
  renderTimeline=function(){baseRenderTimeline();decorateTrackControls();decorateTrimHandles();const snap=$('#snapToggle');if(snap){snap.classList.toggle('active',state.timeline.snapping!==false);snap.textContent=state.timeline.snapping===false?'Snap off':'Snap on'}};

  window.addEventListener('pointermove',ev=>{
    const d=state.trimDrag;if(!d)return;ev.preventDefault();const delta=(ev.clientX-d.startX)/d.width*d.total;state.timeline=trimLinked(d.base,d.clipId,d.side,delta);renderTimeline();
  },{passive:false});
  window.addEventListener('pointerup',()=>{const d=state.trimDrag;if(!d)return;pushUndo(d.before);state.trimDrag=null;learn('accepted',`manual trim ${d.side}`,d.clipId);markDirty();renderTimeline()});

  const top=$('.timelineTop>div');
  if(top&&!$('#snapToggle')){const b=document.createElement('button');b.id='snapToggle';b.textContent='Snap on';b.className='active';b.onclick=()=>{state.timeline.snapping=state.timeline.snapping===false;markDirty();renderTimeline()};top.appendChild(b)}

  const ruler=$('#ruler');
  if(ruler){ruler.title='Click to move the timeline playhead';ruler.onpointerdown=ev=>{const rect=ruler.getBoundingClientRect(),ratio=clamp((ev.clientX-rect.left)/Math.max(1,rect.width),0,1),time=frameSnap(ratio*timelineTotal());video.currentTime=Math.min(Number(video.duration)||time,time);$('#time').textContent=tc(time);renderTimeline()}}

  document.addEventListener('keydown',ev=>{
    const target=ev.target;if(target&&['INPUT','TEXTAREA','SELECT'].includes(target.tagName))return;
    const mod=ev.ctrlKey||ev.metaKey;
    if(mod&&ev.key.toLowerCase()==='z'){ev.preventDefault();$('#undoEdit')?.click();return}
    if(ev.code==='Space'){ev.preventDefault();video.paused?video.play().catch(()=>{}):video.pause();return}
    if(ev.key.toLowerCase()==='i'){ev.preventDefault();$('#setIn')?.click();return}
    if(ev.key.toLowerCase()==='o'){ev.preventDefault();$('#setOut')?.click();return}
    if(ev.key.toLowerCase()==='m'){ev.preventDefault();$('#markScene')?.click();return}
    if(ev.key==='Delete'&&state.inPoint!==null&&state.outPoint!==null){ev.preventDefault();$('#deleteRange')?.click()}
  });

  renderTimeline();
})();
