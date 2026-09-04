#include <ges/ges.h>
#include <gst/gst.h>
#include <gst/video/videooverlay.h>

#include "inspector_ges.hpp"

#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

using directorcut_monitor::InspectorRuntime;
using directorcut_monitor::InspectorSpec;

struct ClipSpec {
    GESTrackType type = GES_TRACK_TYPE_UNKNOWN;
    std::size_t layer = 0;
    GstClockTime start = 0;
    GstClockTime inpoint = 0;
    GstClockTime duration = 0;
    std::string path;
    std::string id;
    InspectorSpec inspector;
};

struct ManifestSpec {
    std::vector<ClipSpec> clips;
    guint canvas_width = 0;
    guint canvas_height = 0;
};

struct PreviewSignals {
    std::uint64_t window_handle = 0;
    std::atomic<bool> overlay_ready{false};
    std::atomic<bool> frame_ready{false};
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

const std::string& percent_decode_ref(const std::string& input) {
    static thread_local std::string decoded;
    decoded = percent_decode(input);
    return decoded;
}

std::vector<std::string> split_tabs(const std::string& line) {
    std::vector<std::string> fields;
    std::stringstream stream(line);
    std::string part;
    while (std::getline(stream, part, '\t')) fields.push_back(part);
    std::size_t trailing = 0;
    for (auto it = line.rbegin(); it != line.rend() && *it == '\t'; ++it) ++trailing;
    while (trailing-- > 0) fields.emplace_back();
    return fields;
}

bool parse_manifest(const std::string& file, ManifestSpec& manifest, std::string& error) {
    std::ifstream input(file);
    if (!input) {
        error = "Could not open timeline manifest: " + file;
        return false;
    }
    std::string line;
    if (!std::getline(input, line) ||
        (line != "DIRECTORCUT_TIMELINE_V1" && line != "DIRECTORCUT_TIMELINE_V2" && line != "DIRECTORCUT_TIMELINE_V3")) {
        error = "Unsupported DirectorCut timeline manifest";
        return false;
    }
    const bool v2plus = line == "DIRECTORCUT_TIMELINE_V2" || line == "DIRECTORCUT_TIMELINE_V3";
    const bool v3 = line == "DIRECTORCUT_TIMELINE_V3";
    while (std::getline(input, line)) {
        if (line.empty()) continue;
        const auto fields = split_tabs(line);
        if (fields.empty()) continue;
        if (fields[0] == "canvas" && fields.size() >= 3) {
            try {
                manifest.canvas_width = static_cast<guint>(std::stoul(fields[1]));
                manifest.canvas_height = static_cast<guint>(std::stoul(fields[2]));
            } catch (...) {}
            continue;
        }
        if (fields[0] != "clip") continue;
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
            clip.id = fields.size() > 7 ? percent_decode(fields[7]) : std::string();
            if (v2plus && fields.size() >= 16) {
                clip.inspector.x = directorcut_monitor::parse_points(fields[9], percent_decode_ref);
                clip.inspector.y = directorcut_monitor::parse_points(fields[10], percent_decode_ref);
                clip.inspector.scale = directorcut_monitor::parse_points(fields[11], percent_decode_ref);
                clip.inspector.rotation = directorcut_monitor::parse_points(fields[12], percent_decode_ref);
                clip.inspector.opacity = directorcut_monitor::parse_points(fields[13], percent_decode_ref);
                clip.inspector.speed = directorcut_monitor::parse_points(fields[14], percent_decode_ref);
                clip.inspector.volume = directorcut_monitor::parse_points(fields[15], percent_decode_ref);
            }
            if (v3 && fields.size() >= 24) {
                clip.inspector.effects.exposure = std::stod(fields[16]);
                clip.inspector.effects.contrast = std::stod(fields[17]);
                clip.inspector.effects.saturation = std::stod(fields[18]);
                clip.inspector.effects.temperature = std::stod(fields[19]);
                clip.inspector.effects.tint = std::stod(fields[20]);
                clip.inspector.effects.blur = std::stod(fields[21]);
                clip.inspector.effects.sharpen = std::stod(fields[22]);
                clip.inspector.effects.vignette = std::stod(fields[23]);
            }
            if (!clip.path.empty() && clip.duration > 0) manifest.clips.push_back(std::move(clip));
        } catch (const std::exception& ex) {
            error = std::string("Invalid timeline number: ") + ex.what();
            return false;
        }
    }
    if (manifest.clips.empty()) {
        error = "Timeline has no playable video or audio clips";
        return false;
    }
    return true;
}

GstBusSyncReply bus_sync_handler(GstBus*, GstMessage* message, gpointer user_data) {
    if (!gst_is_video_overlay_prepare_window_handle_message(message)) return GST_BUS_PASS;
    auto* signals = static_cast<PreviewSignals*>(user_data);
    if (!signals || signals->window_handle == 0) return GST_BUS_PASS;
    auto* overlay = GST_VIDEO_OVERLAY(GST_MESSAGE_SRC(message));
    gst_video_overlay_set_window_handle(overlay, static_cast<guintptr>(signals->window_handle));
    gst_video_overlay_handle_events(overlay, FALSE);
    if (!signals->overlay_ready.exchange(true)) std::cout << "OVERLAY_READY" << std::endl;
    return GST_BUS_DROP;
}

GstPadProbeReturn first_video_buffer_probe(GstPad*, GstPadProbeInfo* info, gpointer user_data) {
    if (!(GST_PAD_PROBE_INFO_TYPE(info) & (GST_PAD_PROBE_TYPE_BUFFER | GST_PAD_PROBE_TYPE_BUFFER_LIST))) return GST_PAD_PROBE_OK;
    auto* signals = static_cast<PreviewSignals*>(user_data);
    if (signals && !signals->frame_ready.exchange(true)) std::cout << "VIDEO_FRAME" << std::endl;
    return GST_PAD_PROBE_REMOVE;
}

class TimelinePlayer {
public:
    ~TimelinePlayer() { reset(); }

    bool load(const std::string& manifest_file, std::uint64_t window_handle, bool headless, std::string& error) {
        reset();
        window_handle_ = window_handle;
        signals_.window_handle = window_handle;
        signals_.overlay_ready.store(headless);
        signals_.frame_ready.store(false);

        ManifestSpec manifest;
        if (!parse_manifest(manifest_file, manifest, error)) return false;

        timeline_ = ges_timeline_new_audio_video();
        if (!timeline_) {
            error = "GES could not create an audio/video timeline";
            return false;
        }

        const auto max_layer = std::max_element(manifest.clips.begin(), manifest.clips.end(), [](const ClipSpec& a, const ClipSpec& b) { return a.layer < b.layer; })->layer;
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

        std::vector<std::string> warnings;
        for (const auto& clip : manifest.clips) {
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
                layers.at(clip.layer), GES_ASSET(asset), clip.start, clip.inpoint, clip.duration, clip.type, &add_error);
            g_object_unref(asset);
            if (!added) {
                error = add_error ? add_error->message : "GES could not add clip to timeline";
                if (add_error) g_error_free(add_error);
                return false;
            }

            if (!clip.id.empty()) {
                InspectorRuntime runtime;
                std::string warning;
                directorcut_monitor::configure_inspector(
                    added, clip.type, clip.inspector, manifest.canvas_width, manifest.canvas_height,
                    clip.inpoint, runtime, warning);
                inspector_[clip.id] = runtime;
                if (!warning.empty()) warnings.push_back(clip.id + ": " + warning);
            }
        }

        ges_timeline_commit_sync(timeline_);

        pipeline_ = ges_pipeline_new();
        if (!pipeline_) {
            error = "GES could not create preview pipeline";
            return false;
        }
        g_object_ref_sink(pipeline_);

        GstElement* video_sink = nullptr;
        GstElement* audio_sink = nullptr;
        const char* video_sink_name = nullptr;
        if (headless) {
            video_sink = gst_element_factory_make("fakesink", "directorcut-video-sink");
            video_sink_name = video_sink ? "fakesink" : nullptr;
            audio_sink = gst_element_factory_make("fakesink", "directorcut-audio-sink");
        } else {
#ifdef _WIN32
            video_sink = gst_element_factory_make("glimagesink", "directorcut-video-sink");
            video_sink_name = video_sink ? "glimagesink" : nullptr;
            if (!video_sink) {
                video_sink = gst_element_factory_make("d3d12videosink", "directorcut-video-sink");
                video_sink_name = video_sink ? "d3d12videosink" : nullptr;
            }
            if (!video_sink) {
                video_sink = gst_element_factory_make("d3d11videosink", "directorcut-video-sink");
                video_sink_name = video_sink ? "d3d11videosink" : nullptr;
            }
#else
            video_sink = gst_element_factory_make("glimagesink", "directorcut-video-sink");
            video_sink_name = video_sink ? "glimagesink" : nullptr;
#endif
            if (!video_sink) {
                video_sink = gst_element_factory_make("autovideosink", "directorcut-video-sink");
                video_sink_name = video_sink ? "autovideosink" : nullptr;
            }
            audio_sink = gst_element_factory_make("autoaudiosink", "directorcut-audio-sink");
        }
        if (video_sink_name) std::cerr << "INFO\tVIDEO_SINK\t" << video_sink_name << std::endl;
        if (video_sink) {
            if (!headless) {
                GstPad* sink_pad = gst_element_get_static_pad(video_sink, "sink");
                if (sink_pad) {
                    gst_pad_add_probe(sink_pad,
                        static_cast<GstPadProbeType>(GST_PAD_PROBE_TYPE_BUFFER | GST_PAD_PROBE_TYPE_BUFFER_LIST),
                        first_video_buffer_probe, &signals_, nullptr);
                    gst_object_unref(sink_pad);
                }
            }
            g_object_ref_sink(video_sink);
            ges_pipeline_preview_set_video_sink(pipeline_, video_sink);
            g_object_unref(video_sink);
        }
        if (audio_sink) {
            g_object_ref_sink(audio_sink);
            ges_pipeline_preview_set_audio_sink(pipeline_, audio_sink);
            g_object_unref(audio_sink);
        }

        if (!ges_pipeline_set_timeline(pipeline_, timeline_)) {
            error = "GES could not attach timeline to preview pipeline";
            return false;
        }
        timeline_ = nullptr;

        if (!ges_pipeline_set_mode(pipeline_, GES_PIPELINE_MODE_PREVIEW)) {
            error = "GES could not enable preview mode";
            return false;
        }

        GstBus* bus = gst_element_get_bus(GST_ELEMENT(pipeline_));
        if (!bus) {
            error = "GES preview pipeline did not expose a GstBus";
            return false;
        }
        if (!headless) gst_bus_set_sync_handler(bus, bus_sync_handler, &signals_, nullptr);
        gst_object_unref(bus);

        const GstStateChangeReturn state = gst_element_set_state(GST_ELEMENT(pipeline_), GST_STATE_PAUSED);
        if (state == GST_STATE_CHANGE_FAILURE) {
            error = "GES preview pipeline could not enter PAUSED state";
            return false;
        }
        GstState current = GST_STATE_NULL;
        GstState pending = GST_STATE_VOID_PENDING;
        const GstStateChangeReturn preroll = gst_element_get_state(GST_ELEMENT(pipeline_), &current, &pending, 8 * GST_SECOND);
        if (preroll == GST_STATE_CHANGE_FAILURE || current < GST_STATE_PAUSED) {
            error = std::string("GES preview pipeline did not preroll") + (video_sink_name ? std::string(" with ") + video_sink_name : std::string());
            return false;
        }
        for (const auto& warning : warnings) std::cerr << "WARN\t" << warning << std::endl;
        return true;
    }

    bool play() { return pipeline_ && gst_element_set_state(GST_ELEMENT(pipeline_), GST_STATE_PLAYING) != GST_STATE_CHANGE_FAILURE; }
    bool pause() { return pipeline_ && gst_element_set_state(GST_ELEMENT(pipeline_), GST_STATE_PAUSED) != GST_STATE_CHANGE_FAILURE; }
    bool seek(std::uint64_t ns) {
        if (!pipeline_) return false;
        return gst_element_seek_simple(GST_ELEMENT(pipeline_), GST_FORMAT_TIME,
            static_cast<GstSeekFlags>(GST_SEEK_FLAG_FLUSH | GST_SEEK_FLAG_ACCURATE), static_cast<gint64>(ns));
    }
    bool set_property(const std::string& clip_id, const std::string& property, double value) {
        const auto it = inspector_.find(clip_id);
        if (it == inspector_.end()) return false;
        return directorcut_monitor::set_live_property(it->second, property, value);
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

private:
    void reset() {
        if (pipeline_) gst_element_set_state(GST_ELEMENT(pipeline_), GST_STATE_NULL);
        for (auto& [_, runtime] : inspector_) directorcut_monitor::release_runtime(runtime);
        inspector_.clear();
        if (pipeline_) {
            g_object_unref(pipeline_);
            pipeline_ = nullptr;
        }
        if (timeline_) {
            g_object_unref(timeline_);
            timeline_ = nullptr;
        }
        signals_.overlay_ready.store(false);
        signals_.frame_ready.store(false);
    }

    GESPipeline* pipeline_ = nullptr;
    GESTimeline* timeline_ = nullptr;
    std::uint64_t window_handle_ = 0;
    PreviewSignals signals_;
    std::unordered_map<std::string, InspectorRuntime> inspector_;
};

void print_line(const std::string& line) { std::cout << line << std::endl; }

} // namespace

int main(int argc, char** argv) {
    gst_init(&argc, &argv);
    if (!ges_init()) {
        std::cerr << "ERROR\tGES initialization failed" << std::endl;
        return 2;
    }

    std::string manifest;
    std::uint64_t window_handle = 0;
    bool headless = false;
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--manifest" && i + 1 < argc) manifest = argv[++i];
        else if (arg == "--window-handle" && i + 1 < argc) window_handle = std::strtoull(argv[++i], nullptr, 10);
        else if (arg == "--headless") headless = true;
    }
    if (manifest.empty()) {
        std::cerr << "ERROR\tMissing --manifest" << std::endl;
        return 2;
    }

    TimelinePlayer player;
    std::string error;
    if (!player.load(manifest, window_handle, headless, error)) {
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
        } else if (line.rfind("SET\t", 0) == 0) {
            const auto fields = split_tabs(line);
            if (fields.size() < 4) print_line("ERROR\tSET");
            else {
                try {
                    const std::string clip_id = percent_decode(fields[1]);
                    const std::string property = fields[2];
                    const double value = std::stod(fields[3]);
                    print_line(player.set_property(clip_id, property, value) ? "OK\tSET" : "ERROR\tSET");
                } catch (...) { print_line("ERROR\tSET"); }
            }
        } else if (line == "QUIT") {
            print_line("BYE");
            break;
        } else if (!line.empty()) print_line("ERROR\tUNKNOWN_COMMAND");
    }
    return 0;
}
