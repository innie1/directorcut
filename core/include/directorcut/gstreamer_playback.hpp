#pragma once
#include <cstdint>
#include <memory>
#include <string>
namespace directorcut {
class GStreamerPlayback {
public:
    GStreamerPlayback();
    ~GStreamerPlayback();
    GStreamerPlayback(const GStreamerPlayback&) = delete;
    GStreamerPlayback& operator=(const GStreamerPlayback&) = delete;
    bool open(const std::string& file_or_uri);
    bool play();
    bool pause();
    bool stop();
    bool seek_ns(std::int64_t position_ns, bool accurate = true);
    std::int64_t position_ns() const;
    std::int64_t duration_ns() const;
    std::string last_error() const;
    bool available() const;
private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};
}
