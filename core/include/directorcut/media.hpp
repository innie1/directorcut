#pragma once
#include <string>
#include <vector>
namespace directorcut {
class MediaTooling {
public:
    [[nodiscard]] static std::vector<std::string> proxy_command(const std::string& input,const std::string& output,int width=1280);
    [[nodiscard]] static std::vector<std::string> audio_extract_command(const std::string& input,const std::string& output_wav);
    [[nodiscard]] static std::string display_command(const std::vector<std::string>& args);
};
}
