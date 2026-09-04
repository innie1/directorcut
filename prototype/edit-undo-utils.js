(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DirectorEditUndoUtils=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clone=value=>JSON.parse(JSON.stringify(value??[]));

  function undoEditOnly(state,restoreEdit){
    if(!state||!Array.isArray(state.undo)||typeof restoreEdit!=='function')return{ok:false,reason:'invalid'};
    const snapshot=state.undo.pop();
    if(!snapshot)return{ok:false,reason:'empty'};
    const conversation=clone(state.conversation||[]);
    restoreEdit(snapshot);
    // Conversation is intentionally outside edit history. Even if an old restore path
    // mutates it, put the exact user/Director history back after the edit is restored.
    state.conversation=conversation;
    return{ok:true,snapshot};
  }

  return{undoEditOnly};
});
