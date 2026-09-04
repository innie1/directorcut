#include "directorcut/transcript.hpp"
#include <algorithm>
#include <cctype>
#include <sstream>

namespace directorcut {
static std::string norm(std::string s){
    std::string o; for(unsigned char c:s) if(std::isalnum(c)||std::isspace(c)) o.push_back(static_cast<char>(std::tolower(c))); return o;
}
static std::vector<std::string> toks(const std::string& s){ std::istringstream in(norm(s)); std::vector<std::string> v; std::string w; while(in>>w)v.push_back(w); return v; }
void TranscriptIndex::add_word(TranscriptWord w){ words_.push_back(std::move(w)); std::sort(words_.begin(),words_.end(),[](auto&a,auto&b){return a.start_ms<b.start_ms;}); }
std::vector<TranscriptMatch> TranscriptIndex::find_phrase(const std::string& phrase) const {
    auto q=toks(phrase); std::vector<TranscriptMatch> out; if(q.empty()) return out;
    for(size_t i=0;i+q.size()<=words_.size();++i){ bool ok=true; std::string ex;
        for(size_t j=0;j<q.size();++j){ auto wt=toks(words_[i+j].text); auto w=wt.empty()?std::string{}:wt.front(); if(w!=q[j]){ok=false;break;} if(j)ex+=' '; ex+=words_[i+j].text; }
        if(ok) out.push_back({words_[i].start_ms,words_[i+q.size()-1].end_ms,ex});
    } return out;
}
}
