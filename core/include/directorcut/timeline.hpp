#pragma once
#include "directorcut/types.hpp"
#include <optional>
#include <string>
#include <vector>

namespace directorcut {
class Timeline {
public:
    void add_track(Track track);
    bool remove_track(const std::string& track_id);
    bool add_clip(const std::string& track_id, Clip clip);
    bool remove_clip(const std::string& track_id, const std::string& clip_id, Clip* removed = nullptr);
    bool move_clip(const std::string& track_id, const std::string& clip_id, Millis new_start_ms, Millis* old_start = nullptr);
    bool trim_clip(const std::string& track_id, const std::string& clip_id, Millis new_source_in_ms, Millis new_source_out_ms,
                   Millis* old_source_in_ms = nullptr, Millis* old_source_out_ms = nullptr);
    bool split_clip(const std::string& track_id, const std::string& clip_id, Millis timeline_ms,
                    std::string left_id, std::string right_id, Clip* original = nullptr);
    [[nodiscard]] std::optional<Clip> clip(const std::string& track_id, const std::string& clip_id) const;
    [[nodiscard]] const std::vector<Track>& tracks() const { return tracks_; }
    [[nodiscard]] Millis duration_ms() const;

private:
    std::vector<Track> tracks_;
    Track* find_track(const std::string& track_id);
    const Track* find_track(const std::string& track_id) const;
};
}
