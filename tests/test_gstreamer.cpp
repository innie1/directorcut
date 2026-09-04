#include "directorcut/gstreamer_playback.hpp"
#include <iostream>

int main() {
    directorcut::GStreamerPlayback playback;
    if (!playback.available()) {
        std::cerr << "GStreamer backend unavailable: " << playback.last_error() << '\n';
        return 1;
    }
    std::cout << "GStreamer backend initialized\n";
    return 0;
}
