#include "directorcut/commands.hpp"
#include "directorcut/director.hpp"
#include "directorcut/transcript.hpp"
#include <cassert>
#include <iostream>
using namespace directorcut;
int main(){
    Timeline t; t.add_track({"v1","Video",TrackType::Video,{}});
    assert(t.add_clip("v1",{"c1","A","a.mp4",0,10000,0,false}));
    assert(t.split_clip("v1","c1",4000,"l","r"));
    assert(t.clip("v1","l")->duration_ms()==4000);
    assert(t.clip("v1","r")->timeline_start_ms==4000);
    assert(t.trim_clip("v1","r",4500,9000));
    assert(t.clip("v1","r")->duration_ms()==4500);

    CommandHistory h; h.timeline().add_track({"v1","Video",TrackType::Video,{}});
    assert(h.apply(std::make_unique<AddClipCommand>("v1",Clip{"x","X","x.mp4",0,5000,0,false})));
    assert(h.apply(std::make_unique<TrimClipCommand>("v1","x",500,4500)));
    assert(h.timeline().clip("v1","x")->duration_ms()==4000);
    assert(h.undo()); assert(h.timeline().clip("v1","x")->duration_ms()==5000);
    assert(h.redo()); assert(h.timeline().clip("v1","x")->duration_ms()==4000);
    assert(h.apply(std::make_unique<RemoveClipCommand>("v1","x")));
    assert(!h.timeline().clip("v1","x"));
    assert(h.undo()); assert(h.timeline().clip("v1","x"));

    DirectorPlanner p; auto scenes=p.break_script_into_scenes("This is the hook.\n\nRevenue increased from 4 million to 27 million.\n\nThen everything changed.");
    assert(scenes.size()==3); assert(scenes[0].purpose=="Hook"); assert(scenes[1].purpose=="Evidence");

    TranscriptIndex ix; ix.add_word({"we",0,100}); ix.add_word({"made",110,250}); ix.add_word({"fifty",260,400}); ix.add_word({"million",410,600});
    auto m=ix.find_phrase("fifty million"); assert(m.size()==1 && m[0].start_ms==260 && m[0].end_ms==600);
    std::cout<<"all core tests passed\n"; return 0;
}
