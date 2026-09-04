#include "directorcut/director.hpp"
#include <algorithm>
#include <cctype>
#include <cmath>
#include <sstream>

namespace directorcut {
static std::string trim(std::string s){
    auto ns=[](unsigned char c){return !std::isspace(c);};
    s.erase(s.begin(), std::find_if(s.begin(),s.end(),ns));
    s.erase(std::find_if(s.rbegin(),s.rend(),ns).base(),s.end()); return s;
}
static int word_count(const std::string& s){ std::istringstream in(s); std::string w; int n=0; while(in>>w)++n; return n; }

std::vector<Scene> DirectorPlanner::break_script_into_scenes(const std::string& script) const {
    std::vector<std::string> blocks; std::stringstream ss(script); std::string line, current;
    while(std::getline(ss,line)) {
        if(trim(line).empty()) { if(!trim(current).empty()){ blocks.push_back(trim(current)); current.clear(); } }
        else { if(!current.empty()) current += ' '; current += trim(line); }
    }
    if(!trim(current).empty()) blocks.push_back(trim(current));
    if(blocks.empty() && !trim(script).empty()) blocks.push_back(trim(script));

    std::vector<Scene> scenes; int n=1;
    for(const auto& b:blocks){
        const int words=std::max(1,word_count(b));
        const auto ms=static_cast<Millis>(std::llround((words/150.0)*60.0*1000.0));
        Scene s; s.number=n; s.text=b; s.estimated_duration_ms=std::max<Millis>(2500,ms);
        const bool has_number=std::any_of(b.begin(),b.end(),[](unsigned char c){return std::isdigit(c);});
        if(n==1){ s.purpose="Hook"; s.visual="Presenter close-up or strongest visual evidence"; s.performance_note="Start controlled; emphasize the final phrase. Avoid intro padding."; }
        else if(has_number){ s.purpose="Evidence"; s.visual="Source visual + animated number/callout"; s.performance_note="Slow slightly on the key figure and leave room for the graphic."; }
        else { s.purpose="Narrative"; s.visual="Presenter/B-roll chosen from semantic match"; s.performance_note="Natural delivery; preserve the strongest sentence ending."; }
        scenes.push_back(std::move(s)); ++n;
    }
    return scenes;
}

std::string DirectorPlanner::mode_name(DirectorMode m){ switch(m){case DirectorMode::Ask:return "Ask";case DirectorMode::CoEdit:return "Co-edit";case DirectorMode::Auto:return "Auto";}return "Unknown"; }
}
