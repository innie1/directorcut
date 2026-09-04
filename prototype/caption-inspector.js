// Stage 4 unified caption/text Inspector and Chromium fallback preview.
(() => {
  function boot(attempt=0){
    const TL=window.DirectorTimeline,CE=window.DirectorCaptionEditor,pane=document.querySelector('.inspectorPane'),content=pane?.querySelector('#inspectorContent'),monitor=document.querySelector('.monitor'),video=document.querySelector('#video');
    if(!TL||!CE||!pane||!content||!monitor||!video){if(attempt<40)setTimeout(()=>boot(attempt+1),75);return;}
    if(window.DirectorCutCaptionInspector)return;
    if(!document.querySelector('link[data-caption-inspector-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='caption-inspector.css';link.dataset.captionInspectorStyle='1';document.head.appendChild(link);}
    const sessions=new WeakMap(),notice=text=>window.DirectorCutEditorToast?.(text),now=()=>Number(window.DirectorCutTimelineClock?.now?.()??video.currentTime??0)||0;
    const selected=()=>state.selectedClipId?TL.findClip(state.timeline,state.selectedClipId):null;
    const isCaption=found=>found?.track?.kind==='caption';
    function snapshotNow(){return typeof snapshot==='function'?snapshot():null}
    function push(before){if(typeof pushUndo==='function'){if(before)pushUndo(before);else pushUndo()}}
    function dirty(message){if(typeof markDirty==='function')markDirty();if(typeof renderTimeline==='function')renderTimeline();sync();renderPreview();if(message)notice(message)}

    const section=document.createElement('section');section.className='inspectorSection';section.id='captionInspectorSection';section.hidden=true;section.innerHTML=`
      <h3>Text & Caption</h3>
      <div class="captionField"><label>Text</label><textarea id="captionContent" class="captionTextArea" maxlength="2000"></textarea></div>
      <div class="captionStyleGrid" style="margin-top:9px">
        <div class="captionField"><label>Font</label><input id="captionFont" type="text" value="Sans"></div>
        <div class="captionField"><label>Size</label><input id="captionSize" type="number" min="8" max="240" step="1"></div>
      </div>
      <div class="captionChecks"><label><input id="captionBold" type="checkbox"> Bold</label><label><input id="captionItalic" type="checkbox"> Italic</label></div>
      <div class="captionField"><label>Alignment</label><div id="captionAlign" class="captionAlignGroup"><button type="button" data-align="left">Left</button><button type="button" data-align="center">Center</button><button type="button" data-align="right">Right</button></div></div>
      <div class="captionColorRow" style="margin-top:9px">
        <div class="captionField"><label>Text color</label><input id="captionColor" type="color"></div>
        <div class="captionField"><label>Outline color</label><input id="captionOutlineColor" type="color"></div>
      </div>
      <div class="captionStyleGrid" style="margin-top:9px">
        <div class="captionField"><label>Outline width</label><input id="captionOutlineWidth" type="number" min="0" max="12" step="0.5"></div>
        <div class="captionField"><label>Background opacity %</label><input id="captionBackgroundOpacity" type="number" min="0" max="100" step="1"></div>
      </div>
      <div class="captionField" style="margin-top:9px"><label>Background color</label><input id="captionBackgroundColor" type="color"></div>
      <div class="captionPositionGrid" style="margin-top:9px">
        <div class="captionField"><label>X %</label><input id="captionX" type="number" min="0" max="100" step="1"></div>
        <div class="captionField"><label>Y %</label><input id="captionY" type="number" min="0" max="100" step="1"></div>
        <div class="captionField"><label>Width %</label><input id="captionWidth" type="number" min="10" max="100" step="1"></div>
      </div>
      <small class="captionInspectorHint">Caption text and styling are stored on the timeline clip. Trim or move the clip to change its timing. MP4 and SRT export use these edited clips.</small>`;
    content.appendChild(section);

    const addButton=document.createElement('button');addButton.id='addTextCaption';addButton.className='addTextButton';addButton.textContent='＋ Text';addButton.title='Add text/caption at playhead';const marker=document.querySelector('#markScene');if(marker)marker.insertAdjacentElement('afterend',addButton);else document.querySelector('.simplifiedTransport')?.appendChild(addButton);

    const overlay=document.createElement('div');overlay.id='captionPreviewOverlay';overlay.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:8;';monitor.appendChild(overlay);
    const ids={content:'captionContent',fontFamily:'captionFont',fontSize:'captionSize',bold:'captionBold',italic:'captionItalic',color:'captionColor',outlineColor:'captionOutlineColor',outlineWidth:'captionOutlineWidth',backgroundColor:'captionBackgroundColor',backgroundOpacity:'captionBackgroundOpacity',x:'captionX',y:'captionY',maxWidth:'captionWidth'};
    const fields=Object.fromEntries(Object.entries(ids).map(([key,id])=>[key,section.querySelector(`#${id}`)]));

    function ensureCaptionTrack(){state.timeline=TL.normalizeTimeline(state.timeline);let track=state.timeline.tracks.find(t=>t.kind==='caption');if(track)return track;let i=1,id='C1';while(state.timeline.tracks.some(t=>t.id===id))id=`C${++i}`;track={id,name:'Captions',kind:'caption',locked:false,muted:false,hidden:false,solo:false,height:52,clips:[]};state.timeline.tracks.unshift(track);return track;}
    function addCaption(){push();const track=ensureCaptionTrack(),duration=Math.max(.2,Math.min(3,Math.max(.2,TL.duration(state.timeline)-now())||3)),clip=CE.createManual({trackId:track.id,start:TL.snapTime(now(),state.timeline.fps),duration,content:'Text'});track.clips.push(clip);track.clips.sort((a,b)=>a.start-b.start);state.selectedClipId=clip.id;dirty('Text clip added');document.querySelector('[data-right-pane="inspector"]')?.click();setTimeout(()=>fields.content?.focus(),0);}
    addButton.addEventListener('click',addCaption);

    function patchSelected(patch,message='Caption updated'){const found=selected();if(!isCaption(found))return;state.timeline=CE.patch(state.timeline,found.clip.id,patch);if(typeof renderTimeline==='function')renderTimeline();renderPreview();return message;}
    function startSession(input){if(!sessions.has(input))sessions.set(input,snapshotNow())}
    function commit(input,message='Caption updated'){const before=sessions.get(input);if(before)push(before);sessions.delete(input);if(typeof markDirty==='function')markDirty();if(typeof renderTimeline==='function')renderTimeline();sync();renderPreview();notice(message)}
    const stylePatch=(key,value)=>({style:{[key]:value}});

    fields.content.addEventListener('focus',()=>startSession(fields.content));fields.content.addEventListener('input',()=>patchSelected({content:fields.content.value}));fields.content.addEventListener('change',()=>commit(fields.content,'Caption text updated'));
    fields.fontFamily.addEventListener('focus',()=>startSession(fields.fontFamily));fields.fontFamily.addEventListener('input',()=>patchSelected(stylePatch('fontFamily',fields.fontFamily.value)));fields.fontFamily.addEventListener('change',()=>commit(fields.fontFamily,'Caption font updated'));
    for(const [key,input] of [['fontSize',fields.fontSize],['outlineWidth',fields.outlineWidth],['backgroundOpacity',fields.backgroundOpacity],['x',fields.x],['y',fields.y],['maxWidth',fields.maxWidth]]){
      input.addEventListener('focus',()=>startSession(input));input.addEventListener('input',()=>{if(input.value==='')return;let value=Number(input.value);if(['backgroundOpacity','x','y','maxWidth'].includes(key))value/=100;if(key==='x'||key==='y')patchSelected({position:{[key]:value}});else if(key==='maxWidth')patchSelected({maxWidth:value});else patchSelected(stylePatch(key,value));});input.addEventListener('change',()=>commit(input));
    }
    for(const [key,input] of [['color',fields.color],['outlineColor',fields.outlineColor],['backgroundColor',fields.backgroundColor]]){input.addEventListener('focus',()=>startSession(input));input.addEventListener('input',()=>patchSelected(stylePatch(key,input.value)));input.addEventListener('change',()=>commit(input));}
    for(const [key,input] of [['bold',fields.bold],['italic',fields.italic]])input.addEventListener('change',()=>{push();patchSelected(stylePatch(key,input.checked));if(key==='bold')patchSelected(stylePatch('fontWeight',input.checked?700:400));dirty(`Caption ${key} ${input.checked?'enabled':'disabled'}`)});
    section.querySelector('#captionAlign').addEventListener('click',event=>{const button=event.target.closest('[data-align]');if(!button)return;push();patchSelected(stylePatch('align',button.dataset.align));dirty(`Caption aligned ${button.dataset.align}`)});

    function sync(){const found=selected(),caption=isCaption(found);pane.classList.toggle('captionSelected',caption);section.hidden=!caption;if(!caption)return;const text=CE.normalizeText(found.clip.text,found.clip.name||''),style=text.style;if(document.activeElement!==fields.content)fields.content.value=text.content;if(document.activeElement!==fields.fontFamily)fields.fontFamily.value=style.fontFamily;if(document.activeElement!==fields.fontSize)fields.fontSize.value=Math.round(style.fontSize);fields.bold.checked=style.bold;fields.italic.checked=style.italic;fields.color.value=style.color;fields.outlineColor.value=style.outlineColor;if(document.activeElement!==fields.outlineWidth)fields.outlineWidth.value=style.outlineWidth;if(document.activeElement!==fields.backgroundOpacity)fields.backgroundOpacity.value=Math.round(style.backgroundOpacity*100);fields.backgroundColor.value=style.backgroundColor;if(document.activeElement!==fields.x)fields.x.value=Math.round(text.position.x*100);if(document.activeElement!==fields.y)fields.y.value=Math.round(text.position.y*100);if(document.activeElement!==fields.maxWidth)fields.maxWidth.value=Math.round(text.maxWidth*100);section.querySelectorAll('[data-align]').forEach(button=>button.classList.toggle('active',button.dataset.align===style.align));}

    function renderPreview(){overlay.replaceChildren();if(window.DirectorCutProgramMonitor?.active)return;const time=now(),captions=CE.clips(state.timeline).filter(c=>time>=Number(c.start)-1e-4&&time<Number(c.start)+Number(c.duration)-1e-4);for(const clip of captions){const text=CE.normalizeText(clip.text,clip.name||''),style=text.style,node=document.createElement('div');node.textContent=text.content;node.style.cssText=`position:absolute;left:${text.position.x*100}%;top:${text.position.y*100}%;transform:translate(-50%,-50%);max-width:${text.maxWidth*100}%;white-space:pre-wrap;text-align:${style.align};font-family:${JSON.stringify(style.fontFamily)};font-size:${style.fontSize}px;font-weight:${style.bold?700:style.fontWeight};font-style:${style.italic?'italic':'normal'};color:${style.color};line-height:1.16;padding:${style.backgroundOpacity>0?'0.12em 0.28em':'0'};background:${style.backgroundColor}${Math.round(style.backgroundOpacity*255).toString(16).padStart(2,'0')};-webkit-text-stroke:${style.outlineWidth}px ${style.outlineColor};paint-order:stroke fill;`;overlay.appendChild(node)}}

    document.addEventListener('click',event=>{if(event.target.closest('.clip[data-clip-id]'))setTimeout(()=>{sync();renderPreview()},0)},true);video.addEventListener('timeupdate',renderPreview);const previewTimer=setInterval(()=>{if(!window.DirectorCutProgramMonitor?.active)renderPreview();else if(overlay.childElementCount)overlay.replaceChildren()},120);
    if(typeof renderTimeline==='function'){const base=renderTimeline;renderTimeline=function(...args){const result=base.apply(this,args);setTimeout(()=>{sync();renderPreview()},0);return result;};}
    window.addEventListener('beforeunload',()=>clearInterval(previewTimer));window.DirectorCutCaptionInspector={sync,renderPreview,addCaption};sync();renderPreview();
  }
  boot();
})();
