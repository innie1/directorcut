const assert = require('assert');
const { undoEditOnly } = require('../../prototype/edit-undo-utils');

const state = {
  timeline: { value: 'edited' },
  conversation: [
    { role: 'user', content: 'Please tighten this scene' },
    { role: 'assistant', content: 'I will remove the pause.' }
  ],
  undo: [{ timeline: { value: 'before-edit' } }]
};

const beforeConversation = JSON.parse(JSON.stringify(state.conversation));
const result = undoEditOnly(state, snapshot => {
  state.timeline = snapshot.timeline;
  // Simulate a bad legacy restore path trying to replace chat state.
  state.conversation = [];
});

assert.equal(result.ok, true);
assert.deepEqual(state.timeline, { value: 'before-edit' });
assert.deepEqual(state.conversation, beforeConversation);
assert.equal(state.undo.length, 0);

const empty = undoEditOnly(state, () => {});
assert.equal(empty.ok, false);
assert.equal(empty.reason, 'empty');
assert.deepEqual(state.conversation, beforeConversation);

console.log('edit undo conversation preservation tests passed');
