#include <ges/ges.h>
#include <gst/gst.h>
#include <gst/video/videooverlay.h>

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

namespace {

struct ClipSpec {
    GESTrackType type = GES_TRACK_TYPE_UNKNOWN;
    std::size_t layer = 0;
    GstClockTime start = 0;
    GstClockTime inpoint = 0;
    GstClockTime duration = 0;
    std::string path;
};

std::string percent_decode(const std::string& input) {
    std::string out;
    out.reserve(input.size());
    for (std::size_t i = 0; i < input.size(); ++i) {
        if (input[i] == '%' && i + 2 < input.size()) {
            auto hex = [](char c) -> int {
                if (c >= '0' && c <= '9') return c - '0';
                if (c >= 'a' && c <= 'f') return c - 'a' + 10;
                if (c >= 'A' && c <= 'F') return c - 'A' + 10;
                return -1;
            };
            const int hi = hex(input[i + 1]);
            const int lo = hex(input[i + 2]);
            if (hi >= 0 && lo >= 0) {
                out.push_back(static_cast<char>((hi << 4) | lo));
                i += 2;
                continue;
            }
        }
        out.push_back(input[i] == '+' ? ' ' : input[i]);
    }
    return out;
}

std::vector<std::string> split_tabs(const std::string& line) {
    std::vector<std::string> fields;
    std::stringstream stream(line);
    std::string part;
    while (std::getline(stream, part, '\t')) fields.push_back(part);
    return fields;
}

bool parse_manifest(const std::string& file, std::vector<ClipSpec>& clips, std::string& error) {
    std::ifstream input(file);
    if (!input) {
        error = "Could not open timeline manifest: " + file;
        return false;
    }
    std::string line;
    if (!std::getline(input, line) || line != "DIRECTORCUT_TIMELINE_V1") {
        error = "Unsupported DirectorCut timeline manifest";
        return false;
    }
    while (std::getline(input, line)) {
        if (line.empty()) continue;
        const auto fields = split_tabs(line);
        if (fields.empty() || fields[0] != "clip") continue;
        if (fields.size() < 7) {
            error = "Malformed clip line in timeline manifest";
            return false;
        }
        try {
            ClipSpec clip;
            clip.type = fields[1] == "audio" ? GES_TRACK_TYPE_AUDIO : fields[1] == "video" ? GES_TRACK_TYPE_VIDEO : GES_TRACK_TYPE_UNKNOWN;
            if (clip.type == GES_TRACK_TYPE_UNKNOWN) continue;
            clip.layer = static_cast<std::size_t>(std::stoull(fields[2]));
            clip.start = static_cast<GstClockTime>(std::stoull(fields[3]));
            clip.inpoint = static_cast<GstClockTime>(std::stoull(fields[4]));
            clip.duration = static_cast<GstClockTime>(std::stoull(fields[5]));
            clip.path = percent_decode(fields[6]);
            if (!clip.path.empty() && clip.duration > 0) clips.push_back(std::move(clip));
        } catch (const std::exception& ex) {
            error = std::string("Invalid timeline number: ") + ex.what();
            return false;
        }
    }
    if (clips.empty()) {
        error = "Timeline has no playable video or audio clips";
        return false;
    }
    return true;
}

GstBusSyncReply bus_sync_handler(GstBus*, GstMessage* message, gpointer user_data) {
    if (!gst_is_video_overlay_prepare_window_handle_message(message)) return GST_BUS_PASS;
    const auto handle = static_cast<guintptr>(*static_cast<std::uint64_t*>(user_data));
    if (handle == 0) return GST_BUS_PASS;
    auto* overlay = GST_VIDEO_OVERLAY(GST_MESSAGE_SRC(message));
    gst_video_overlay_set_window_handle(overlay, handle);
    gst_video_overlay_handle_events(overlay, FALSE);
    return GST_BUS_DROP;
}

class TimelinePlayer {
public:
    ~TimelinePlayer() { reset(); }

    bool load(const std::string& manifest, std::uint64_t window_handle, std::string& error) {
        reset();
        window_handle_ = window_handle;

        std::vector<ClipSpec> clips;
        if (!parse_manifest(manifest, clips, error)) return false;

        timeline_ = ges_timeline_new_audio_video();
        if (!timeline_) {
            error = "GES could not create an audio/video timeline";
            return false;
        }

        const auto max_layer = std::max_element(clips.begin(), clips.end(), [](const ClipSpec& a, const ClipSpec& b) { return a.layer < b.layer; })->layer;
        std::vector<GESLayer*> layers;
        layers.reserve(max_layer + 1);
        for (std::size_t i = 0; i <= max_layer; ++i) {
            GESLayer* layer = ges_timeline_append_layer(timeline_);
            if (!layer) {
                error = "GES could not create timeline layer " + std::to_string(i);
                return false;
            }
            layers.push_back(layer);
        }

        for (const auto& clip : clips) {
            GError* uri_error = nullptr;
            gchar* uri = gst_filename_to_uri(clip.path.c_str(), &uri_error);
            if (!uri) {
                error = uri_error ? uri_error->message : "Could not convert media path to URI";
                if (uri_error) g_error_free(uri_error);
                return false;
            }
            GError* asset_error = nullptr;
            GESUriClipAsset* asset = ges_uri_clip_asset_request_sync(uri, &asset_error);
            g_free(uri);
            if (!asset) {
                error = asset_error ? asset_error->message : "GES could not load media asset";
                if (asset_error) g_error_free(asset_error);
                return false;
            }
            GError* add_error = nullptr;
            GESClip* added = ges_layer_add_asset_full(
                layers.at(clip.layer),
                GES_ASSET(asset),
                clip.start,
                clip.inpoint,
                clip.duration,
                clip.type,
                &add_error);
            gst_object_unref(asset);
            if (!added) {
                error = add_error ? add_error->message : "GES could not add clip to timeline";
                if (add_error) g_error_free(add_error);
                return false;
            }
        }

        if (!ges_timeline_commit(timeline_)) {
            error = "GES timeline commit failed";
            return false;
        }

        pipeline_ = ges_pipeline_new();
        if (!pipeline_) {
            error = "GES could not create preview pipeline";
            return false;
        }

        GstElement* video_sink = nullptr;
#ifdef _WIN32
        video_sink = gst_element_factory_make("d3d11videosink", "directorcut-video-sink");
        if (!video_sink) video_sink = gst_element_factory_make("d3d12videosink", "directorcut-video-sink");
#endif
        if (!video_sink) video_sink = gst_element_factory_make("glimagesink", "directorcut-video-sink");
        if (!video_sink) video_sink = gst_element_factory_make("autovideosink", "directorcut-video-sink");
        if (video_sink) {
            ges_pipeline_preview_set_video_sink(pipeline_, video_sink);
            gst_object_unref(video_sink);
        }

        GstElement* audio_sink = gst_element_factory_make("autoaudiosink", "directorcut-audio-sink");
        if (audio_sink) {
            ges_pipeline_preview_set_audio_sink(pipeline_, audio_sink);
            gst_object_unref(audio_sink);
        }

        if (!ges_pipeline_set_timeline(pipeline_, timeline_)) {
            error = "GES could not attach timeline to preview pipeline";
            return false;
        }
        timeline_ = nullptr; // ownership transferred to the GES pipeline

        if (!ges_pipeline_set_mode(pipeline_, GES_PIPELINE_MODE_PREVIEW)) {
            error = "GES could not enable preview mode";
            return false;
        }

        GstBus* bus = gst_element_get_bus(GST_ELEMENT(pipeline_));
        gst_bus_set_sync_handler(bus, bus_sync_handler, &window_handle_, nullptr);
        gst_object_unref(bus);

        if (gst_element_set_state(GST_ELEMENT(pipeline_), GST_STATE_PAUSED) == GST_STATE_CHANGE_FAILURE) {
            error = "GES preview pipeline could not preroll";
            return false;
        }
        return true;
    }

    bool play() { return pipeline_ && gst_element_set_state(GST_ELEMENT(pipeline_), GST_STATE_PLAYING) != GST_STATE_CHANGE_FAILURE; }
    bool pause() { return pipeline_ && gst_element_set_state(GST_ELEMENT(pipeline_), GST_STATE_PAUSED) != GST_STATE_CHANGE_FAILURE; }
    bool seek(std::uint64_t ns) {
        if (!pipeline_) return false;
        return gst_element_seek_simple(GST_ELEMENT(pipeline_), GST_FORMAT_TIME,
            static_cast<GstSeekFlags>(GST_SEEK_FLAG_FLUSH | GST_SEEK_FLAG_ACCURATE), static_cast<gint64>(ns));
    }
    std::uint64_t position() const {
        if (!pipeline_) return 0;
        gint64 value = 0;
        return gst_element_query_position(GST_ELEMENT(pipeline_), GST_FORMAT_TIME, &value) && value > 0 ? static_cast<std::uint64_t>(value) : 0;
    }
    std::uint64_t duration() const {
        if (!pipeline_) return 0;
        gint64 value = 0;
        return gst_element_query_duration(GST_ELEMENT(pipeline_), GST_FORMAT_TIME, &value) && value > 0 ? static_cast<std::uint64_t>(value) : 0;
    }
    bool loaded() const { return pipeline_ != nullptr; }

private:
    void reset() {
        if (pipeline_) {
            gst_element_set_state(GST_ELEMENT(pipeline_), GST_STATE_NULL);
            gst_object_unref(pipeline_);
            pipeline_ = nullptr;
        }
        if (timeline_) {
            gst_object_unref(timeline_);
            timeline_ = nullptr;
        }
    }

    GESPipeline* pipeline_ = nullptr;
    GESTimeline* timeline_ = nullptr;
    std::uint64_t window_handle_ = 0;
};

void print_line(const std::string& line) {
    std::cout << line << std::endl;
}

} // namespace

int main(int argc, char** argv) {
    gst_init(&argc, &argv);
    if (!ges_init()) {
        std::cerr << "ERROR\tGES initialization failed" << std::endl;
        return 2;
    }

    std::string manifest;
    std::uint64_t window_handle = 0;
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--manifest" && i + 1 < argc) manifest = argv[++i];
        else if (arg == "--window-handle" && i + 1 < argc) window_handle = std::strtoull(argv[++i], nullptr, 10);
    }
    if (manifest.empty()) {
        std::cerr << "ERROR\tMissing --manifest" << std::endl;
        return 2;
    }

    TimelinePlayer player;
    std::string error;
    if (!player.load(manifest, window_handle, error)) {
        std::cerr << "ERROR\t" << error << std::endl;
        return 3;
    }
    print_line("READY");

    std::string line;
    while (std::getline(std::cin, line)) {
        if (line == "PLAY") print_line(player.play() ? "OK\tPLAY" : "ERROR\tPLAY");
        else if (line == "PAUSE") print_line(player.pause() ? "OK\tPAUSE" : "ERROR\tPAUSE");
        else if (line == "POSITION") print_line("POSITION\t" + std::to_string(player.position()));
        else if (line == "DURATION") print_line("DURATION\t" + std::to_string(player.duration()));
        else if (line.rfind("SEEK\t", 0) == 0) {
            const auto value = std::strtoull(line.c_str() + 5, nullptr, 10);
            print_line(player.seek(value) ? "OK\tSEEK" : "ERROR\tSEEK");
        } else if (line == "QUIT") {
            print_line("BYE");
            break;
        } else if (!line.empty()) print_line("ERROR\tUNKNOWN_COMMAND");
    }
    return 0;
}
