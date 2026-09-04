#include "directorcut/gstreamer_playback.hpp"
#include <gst/gst.h>
#include <glib.h>
#include <mutex>
namespace directorcut {
struct GStreamerPlayback::Impl {
    GstElement* playbin = nullptr;
    mutable std::mutex mutex;
    std::string error;
    Impl() {
        static std::once_flag once;
        std::call_once(once, [] { gst_init(nullptr, nullptr); });
        playbin = gst_element_factory_make("playbin3", "directorcut-playback");
        if (!playbin) playbin = gst_element_factory_make("playbin", "directorcut-playback");
        if (!playbin) error = "GStreamer playbin/playbin3 is unavailable";
    }
    ~Impl() {
        if (playbin) { gst_element_set_state(playbin, GST_STATE_NULL); gst_object_unref(playbin); }
    }
};
GStreamerPlayback::GStreamerPlayback() : impl_(std::make_unique<Impl>()) {}
GStreamerPlayback::~GStreamerPlayback() = default;
bool GStreamerPlayback::available() const { return impl_ && impl_->playbin; }
std::string GStreamerPlayback::last_error() const { std::scoped_lock lock(impl_->mutex); return impl_->error; }
bool GStreamerPlayback::open(const std::string& file_or_uri) {
    if (!available()) return false;
    gchar* uri = gst_uri_is_valid(file_or_uri.c_str()) ? g_strdup(file_or_uri.c_str()) : gst_filename_to_uri(file_or_uri.c_str(), nullptr);
    if (!uri) { std::scoped_lock lock(impl_->mutex); impl_->error = "Could not convert media path to URI"; return false; }
    gst_element_set_state(impl_->playbin, GST_STATE_READY); g_object_set(impl_->playbin, "uri", uri, nullptr); g_free(uri); return true;
}
bool GStreamerPlayback::play() { return available() && gst_element_set_state(impl_->playbin, GST_STATE_PLAYING) != GST_STATE_CHANGE_FAILURE; }
bool GStreamerPlayback::pause() { return available() && gst_element_set_state(impl_->playbin, GST_STATE_PAUSED) != GST_STATE_CHANGE_FAILURE; }
bool GStreamerPlayback::stop() { return available() && gst_element_set_state(impl_->playbin, GST_STATE_READY) != GST_STATE_CHANGE_FAILURE; }
bool GStreamerPlayback::seek_ns(std::int64_t position_ns, bool accurate) { if (!available()) return false; const auto flags=static_cast<GstSeekFlags>(GST_SEEK_FLAG_FLUSH|(accurate?GST_SEEK_FLAG_ACCURATE:GST_SEEK_FLAG_KEY_UNIT)); return gst_element_seek_simple(impl_->playbin,GST_FORMAT_TIME,flags,static_cast<gint64>(position_ns)); }
std::int64_t GStreamerPlayback::position_ns() const { if(!available())return 0;gint64 value=0;return gst_element_query_position(impl_->playbin,GST_FORMAT_TIME,&value)?value:0; }
std::int64_t GStreamerPlayback::duration_ns() const { if(!available())return 0;gint64 value=0;return gst_element_query_duration(impl_->playbin,GST_FORMAT_TIME,&value)?value:0; }
}
