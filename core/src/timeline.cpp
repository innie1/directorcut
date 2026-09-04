#include "directorcut/timeline.hpp"
#include <algorithm>

namespace directorcut {
void Timeline::add_track(Track track) { tracks_.push_back(std::move(track)); }

Track* Timeline::find_track(const std::string& id) {
    auto it = std::find_if(tracks_.begin(), tracks_.end(), [&](const Track& t){ return t.id == id; });
    return it == tracks_.end() ? nullptr : &*it;
}
const Track* Timeline::find_track(const std::string& id) const {
    auto it = std::find_if(tracks_.begin(), tracks_.end(), [&](const Track& t){ return t.id == id; });
    return it == tracks_.end() ? nullptr : &*it;
}

bool Timeline::remove_track(const std::string& track_id) {
    auto old = tracks_.size();
    std::erase_if(tracks_, [&](const Track& t){ return t.id == track_id; });
    return tracks_.size() != old;
}

bool Timeline::add_clip(const std::string& track_id, Clip clip) {
    auto* t = find_track(track_id);
    if (!t || clip.source_out_ms < clip.source_in_ms) return false;
    t->clips.push_back(std::move(clip));
    std::sort(t->clips.begin(), t->clips.end(), [](const Clip& a, const Clip& b){ return a.timeline_start_ms < b.timeline_start_ms; });
    return true;
}

bool Timeline::remove_clip(const std::string& track_id, const std::string& clip_id, Clip* removed) {
    auto* t = find_track(track_id);
    if (!t) return false;
    auto it = std::find_if(t->clips.begin(), t->clips.end(), [&](const Clip& c){ return c.id == clip_id; });
    if (it == t->clips.end()) return false;
    if (removed) *removed = *it;
    t->clips.erase(it);
    return true;
}

bool Timeline::move_clip(const std::string& track_id, const std::string& clip_id, Millis new_start_ms, Millis* old_start) {
    auto* t = find_track(track_id);
    if (!t || new_start_ms < 0) return false;
    auto it = std::find_if(t->clips.begin(), t->clips.end(), [&](const Clip& c){ return c.id == clip_id; });
    if (it == t->clips.end()) return false;
    if (old_start) *old_start = it->timeline_start_ms;
    it->timeline_start_ms = new_start_ms;
    std::sort(t->clips.begin(), t->clips.end(), [](const Clip& a, const Clip& b){ return a.timeline_start_ms < b.timeline_start_ms; });
    return true;
}

bool Timeline::trim_clip(const std::string& track_id, const std::string& clip_id, Millis new_source_in_ms, Millis new_source_out_ms,
                         Millis* old_source_in_ms, Millis* old_source_out_ms) {
    auto* t = find_track(track_id);
    if (!t || new_source_in_ms < 0 || new_source_out_ms <= new_source_in_ms) return false;
    auto it = std::find_if(t->clips.begin(), t->clips.end(), [&](const Clip& c){ return c.id == clip_id; });
    if (it == t->clips.end()) return false;
    if (old_source_in_ms) *old_source_in_ms = it->source_in_ms;
    if (old_source_out_ms) *old_source_out_ms = it->source_out_ms;
    it->source_in_ms = new_source_in_ms;
    it->source_out_ms = new_source_out_ms;
    return true;
}

bool Timeline::split_clip(const std::string& track_id, const std::string& clip_id, Millis timeline_ms,
                          std::string left_id, std::string right_id, Clip* original) {
    auto* t = find_track(track_id);
    if (!t) return false;
    auto it = std::find_if(t->clips.begin(), t->clips.end(), [&](const Clip& c){ return c.id == clip_id; });
    if (it == t->clips.end()) return false;
    Clip src = *it;
    if (timeline_ms <= src.timeline_start_ms || timeline_ms >= src.timeline_end_ms()) return false;
    const Millis offset = timeline_ms - src.timeline_start_ms;
    Clip left = src;
    Clip right = src;
    left.id = std::move(left_id);
    right.id = std::move(right_id);
    left.source_out_ms = src.source_in_ms + offset;
    right.source_in_ms = src.source_in_ms + offset;
    right.timeline_start_ms = timeline_ms;
    if (original) *original = src;
    t->clips.erase(it);
    t->clips.push_back(std::move(left));
    t->clips.push_back(std::move(right));
    std::sort(t->clips.begin(), t->clips.end(), [](const Clip& a, const Clip& b){ return a.timeline_start_ms < b.timeline_start_ms; });
    return true;
}

std::optional<Clip> Timeline::clip(const std::string& track_id, const std::string& clip_id) const {
    auto* t = find_track(track_id);
    if (!t) return std::nullopt;
    auto it = std::find_if(t->clips.begin(), t->clips.end(), [&](const Clip& c){ return c.id == clip_id; });
    if (it == t->clips.end()) return std::nullopt;
    return *it;
}

Millis Timeline::duration_ms() const {
    Millis d = 0;
    for (const auto& t : tracks_) for (const auto& c : t.clips) d = std::max(d, c.timeline_end_ms());
    return d;
}
}
