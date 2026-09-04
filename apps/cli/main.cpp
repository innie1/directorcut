#include "directorcut/commands.hpp"
#include "directorcut/director.hpp"
#include "directorcut/event_store.hpp"
#include "directorcut/media.hpp"
#include "directorcut/transcript.hpp"
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>

using namespace directorcut;
static std::string read_all(const std::string& p){ std::ifstream f(p); std::ostringstream s; s<<f.rdbuf(); return s.str(); }
static std::string tc(Millis ms){ auto sec=ms/1000; auto m=sec/60; auto s=sec%60; auto rem=ms%1000; std::ostringstream o; o<<std::setfill('0')<<std::setw(2)<<m<<":"<<std::setw(2)<<s<<"."<<std::setw(3)<<rem; return o.str(); }

static int demo(){
    EventStore store("directorcut-demo.db");
    CommandHistory h(&store); h.timeline().add_track({"v1","Video 1",TrackType::Video,{}});
    h.apply(std::make_unique<AddClipCommand>("v1",Clip{"intro","Intro","camera-a.mp4",0,12000,0,false}),"director");
    h.apply(std::make_unique<SplitClipCommand>("v1","intro",5000,"intro-a","intro-b"),"director");
    h.apply(std::make_unique<MoveClipCommand>("v1","intro-b",6500),"user");
    std::cout<<"DirectorCut core demo\nTimeline duration: "<<tc(h.timeline().duration_ms())<<"\n";
    for(const auto&t:h.timeline().tracks()) for(const auto&c:t.clips) std::cout<<"  "<<c.id<<"  "<<tc(c.timeline_start_ms)<<" -> "<<tc(c.timeline_end_ms())<<"\n";
    store.record_learning_event({0,"","correction","serious talking-head","aggressive 12% zoom","rejected","slow 4% push-in"});
    store.set_preference("talking_head_zoom","Prefer subtle 3-6% push-ins; avoid aggressive zooms in serious sections.");
    std::cout<<"Learned: "<<store.preference("talking_head_zoom")<<"\n";
    std::cout<<"Proxy command: "<<MediaTooling::display_command(MediaTooling::proxy_command("input.mp4","proxy.mp4"))<<"\n";
    return 0;
}

int main(int argc,char**argv){
    try{
        if(argc<2){ std::cout<<"directorcut demo | plan <script.txt> | proxy <input> <output>\n"; return 0; }
        std::string cmd=argv[1];
        if(cmd=="demo") return demo();
        if(cmd=="plan" && argc>=3){ DirectorPlanner p; auto scenes=p.break_script_into_scenes(read_all(argv[2])); for(auto&s:scenes) std::cout<<"Scene "<<s.number<<" ["<<s.purpose<<"] "<<tc(s.estimated_duration_ms)<<"\n  "<<s.text<<"\n  Visual: "<<s.visual<<"\n  Performance: "<<s.performance_note<<"\n\n"; return 0; }
        if(cmd=="proxy" && argc>=4){ std::cout<<MediaTooling::display_command(MediaTooling::proxy_command(argv[2],argv[3]))<<"\n"; return 0; }
        std::cerr<<"Unknown or incomplete command\n"; return 2;
    }catch(const std::exception&e){ std::cerr<<"DirectorCut error: "<<e.what()<<"\n"; return 1; }
}
