#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace directorcut {
using Millis = std::int64_t;

enum class TrackType { Video, Audio, Caption, Graphic };

struct Clip {
    std::string id;
    std::string name;
    std::string source;
    Millis source_in_ms{0};
    Millis source_out_ms{0};
    Millis timeline_start_ms{0};
    bool muted{false};

    [[nodiscard]] Millis duration_ms() const { return source_out_ms - source_in_ms; }
    [[nodiscard]] Millis timeline_end_ms() const { return timeline_start_ms + duration_ms(); }
};

struct Track {
    std::string id;
    std::string name;
    TrackType type{TrackType::Video};
    std::vector<Clip> clips;
};

struct Scene {
    int number{0};
    std::string text;
    std::string purpose;
    std::string visual;
    std::string performance_note;
    Millis estimated_duration_ms{0};
};

struct TranscriptWord {
    std::string text;
    Millis start_ms{0};
    Millis end_ms{0};
};
}
