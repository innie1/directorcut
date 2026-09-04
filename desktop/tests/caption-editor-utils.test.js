const assert=require('assert');
const TL=require('../../prototype/timeline-engine');
const CE=require('../../prototype/caption-editor-utils');
const CU=require('../../prototype/caption-utils');

let timeline=TL.normalizeTimeline({fps:30,tracks:[{id:'C1',kind:'caption',clips:[CE.createManual({trackId:'C1',start:1.25,duration:2.5,content:"We're: 100% ready!"})]}]});
const id=timeline.tracks[0].clips[0].id;
timeline=CE.patch(timeline,id,{content:'Edited caption',style:{fontFamily:'Arial',fontSize:48,bold:false,italic:true,align:'right',color:'#12ABEF',outlineColor:'#101010',outlineWidth:3,backgroundColor:'#222222',backgroundOpacity:.65},position:{x:.8,y:.7},maxWidth:.72});
const found=CE.find(timeline,id);assert(found);const text=CE.normalizeText(found.clip.text);assert.equal(text.content,'Edited caption');assert.equal(text.style.fontFamily,'Arial');assert.equal(text.style.fontSize,48);assert.equal(text.style.bold,false);assert.equal(text.style.italic,true);assert.equal(text.style.align,'right');assert.equal(text.style.color,'#12abef');assert.equal(text.style.outlineWidth,3);assert.equal(text.style.backgroundOpacity,.65);assert.equal(text.position.x,.8);assert.equal(text.position.y,.7);assert.equal(text.maxWidth,.72);
const srt=CE.srtFromTimeline(timeline);assert(srt.includes('00:00:01,250 --> 00:00:03,750'));assert(srt.includes('Edited caption'));
const transcript={words:[{text:'Hello',start:0,end:.25},{text:'world.',start:.28,end:.7},{text:'Next',start:1.4,end:1.7},{text:'line.',start:1.75,end:2.1}]};const clips=CU.clipsFromTranscript(transcript,'C1',{maxWords:3});assert(clips.length>=1);assert(clips[0].text);assert.equal(clips[0].text.content,clips[0].name);assert.equal(clips[0].text.style.fontFamily,'Sans');assert.equal(clips[0].text.position.y,.86);
const normalized=CE.normalizeStyle({fontSize:500,outlineWidth:-2,backgroundOpacity:3,color:'bad'});assert.equal(normalized.fontSize,240);assert.equal(normalized.outlineWidth,0);assert.equal(normalized.backgroundOpacity,1);assert.equal(normalized.color,'#ffffff');
console.log('Stage 4 caption editor model tests passed');
