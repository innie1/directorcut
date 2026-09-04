#include "directorcut/media.hpp"
#include <sstream>
namespace directorcut {
std::vector<std::string> MediaTooling::proxy_command(const std::string& in,const std::string& out,int width){
    return {"ffmpeg","-y","-i",in,"-vf","scale='min("+std::to_string(width)+",iw)':-2","-c:v","libx264","-preset","veryfast","-crf","25","-c:a","aac","-b:a","128k",out};
}
std::vector<std::string> MediaTooling::audio_extract_command(const std::string& in,const std::string& out){ return {"ffmpeg","-y","-i",in,"-vn","-ac","1","-ar","16000","-c:a","pcm_s16le",out}; }
std::string MediaTooling::display_command(const std::vector<std::string>& a){ std::ostringstream o; bool first=true; for(auto&s:a){ if(!first)o<<' '; first=false; o<<'\''; for(char c:s){ if(c=='\'')o<<"'\\''"; else o<<c; } o<<'\''; } return o.str(); }
}
