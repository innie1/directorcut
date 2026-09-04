#pragma once

#include <ges/ges.h>
#include <gst/controller/gstinterpolationcontrolsource.h>
#include <gst/controller/gsttimedvaluecontrolsource.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <vector>

namespace directorcut_monitor {

struct KeyPoint {
    GstClockTime time = 0;
    double value = 0.0;
};

struct VisualEffectSpec {
    double exposure = 0.0;
    double contrast = 1.0;
    double saturation = 1.0;
    double temperature = 0.0;
    double tint = 0.0;
    double blur = 0.0;
    double sharpen = 0.0;
    double vignette = 0.0;
};

struct InspectorSpec {
    std::vector<KeyPoint> x;
    std::vector<KeyPoint> y;
    std::vector<KeyPoint> scale;
    std::vector<KeyPoint> rotation;
    std::vector<KeyPoint> opacity;
    std::vector<KeyPoint> speed;
    std::vector<KeyPoint> volume;
    VisualEffectSpec effects;
};

struct InspectorRuntime {
    GESClip* clip = nullptr;                   // owned by the timeline
    GESTrackElement* source = nullptr;         // strong reference held here
    GESEffect* rotation_effect = nullptr;      // owned by clip; optional borrowed pointer
    GESTrackElement* rotation_track = nullptr; // strong reference held here
    GESEffect* color_effect = nullptr;         // owned by clip; optional borrowed pointer
    GESTrackElement* color_track = nullptr;    // strong reference held here
    GESEffect* blur_effect = nullptr;          // owned by clip; optional borrowed pointer
    GESTrackElement* blur_track = nullptr;     // strong reference held here
    GESTrackType type = GES_TRACK_TYPE_UNKNOWN;
    guint canvas_width = 0;
    guint canvas_height = 0;
    double x = 0.0;
    double y = 0.0;
    double scale = 1.0;
    double rotation = 0.0;
    double opacity = 1.0;
    double volume = 1.0;
    double speed = 1.0;
    double exposure = 0.0;
    double contrast = 1.0;
    double saturation = 1.0;
    double temperature = 0.0;
    double tint = 0.0;
    double blur = 0.0;
    double sharpen = 0.0;
    double vignette = 0.0;
};

inline double clamp(double v, double lo, double hi) { return std::max(lo, std::min(hi, v)); }

inline std::vector<KeyPoint> parse_points(const std::string& encoded, const std::string& (*decode)(const std::string&)) {
    std::vector<KeyPoint> out;
    const std::string text = decode(encoded);
    std::stringstream stream(text);
    std::string pair;
    while (std::getline(stream, pair, ',')) {
        const auto colon = pair.find(':');
        if (colon == std::string::npos) continue;
        try {
            const auto t = static_cast<GstClockTime>(std::stoull(pair.substr(0, colon)));
            const double value = std::stod(pair.substr(colon + 1));
            out.push_back({t, value});
        } catch (...) {}
    }
    std::sort(out.begin(), out.end(), [](const KeyPoint& a, const KeyPoint& b) { return a.time < b.time; });
    return out;
}

inline double value_at(const std::vector<KeyPoint>& points, GstClockTime time, double fallback) {
    if (points.empty()) return fallback;
    if (time <= points.front().time) return points.front().value;
    for (std::size_t i = 0; i + 1 < points.size(); ++i) {
        const auto& a = points[i];
        const auto& b = points[i + 1];
        if (time <= b.time) {
            const double span = static_cast<double>(std::max<GstClockTime>(1, b.time - a.time));
            const double p = static_cast<double>(time - a.time) / span;
            return a.value + (b.value - a.value) * p;
        }
    }
    return points.back().value;
}

inline bool set_child_numeric(GESTimelineElement* element, const char* property, double value) {
    if (!element || !property) return false;
    GObject* child = nullptr;
    GParamSpec* pspec = nullptr;
    if (!ges_timeline_element_lookup_child(element, property, &child, &pspec) || !child || !pspec) {
        if (child) g_object_unref(child);
        if (pspec) g_param_spec_unref(pspec);
        return false;
    }

    GValue v = G_VALUE_INIT;
    const GType type = G_PARAM_SPEC_VALUE_TYPE(pspec);
    g_value_init(&v, type);
    if (type == G_TYPE_DOUBLE) g_value_set_double(&v, value);
    else if (type == G_TYPE_FLOAT) g_value_set_float(&v, static_cast<gfloat>(value));
    else if (type == G_TYPE_INT) g_value_set_int(&v, static_cast<gint>(std::llround(value)));
    else if (type == G_TYPE_UINT) g_value_set_uint(&v, static_cast<guint>(std::max(0.0, std::round(value))));
    else if (type == G_TYPE_INT64) g_value_set_int64(&v, static_cast<gint64>(std::llround(value)));
    else if (type == G_TYPE_UINT64) g_value_set_uint64(&v, static_cast<guint64>(std::max(0.0, std::round(value))));
    else {
        g_value_unset(&v);
        g_object_unref(child);
        g_param_spec_unref(pspec);
        return false;
    }
    const bool ok = ges_timeline_element_set_child_property(element, property, &v);
    g_value_unset(&v);
    g_object_unref(child);
    g_param_spec_unref(pspec);
    return ok;
}

inline bool bind_points(GESTrackElement* element, const char* property, const std::vector<KeyPoint>& points,
                        GstClockTime inpoint, double speed, double multiplier = 1.0, double offset = 0.0) {
    if (!element || points.size() < 2) return false;
    GstControlSource* source = gst_interpolation_control_source_new();
    if (!source) return false;
    g_object_set(source, "mode", GST_INTERPOLATION_MODE_LINEAR, nullptr);
    if (!ges_track_element_set_control_source(element, source, property, "direct-absolute")) {
        gst_object_unref(source);
        return false;
    }
    auto* timed = GST_TIMED_VALUE_CONTROL_SOURCE(source);
    bool ok = true;
    for (const auto& point : points) {
        const long double internal = static_cast<long double>(inpoint) + static_cast<long double>(point.time) * std::max(0.01, speed);
        const auto timestamp = static_cast<GstClockTime>(std::max<long double>(0.0L, internal));
        ok = gst_timed_value_control_source_set(timed, timestamp, point.value * multiplier + offset) && ok;
    }
    gst_object_unref(source);
    return ok;
}

inline std::vector<KeyPoint> derived_geometry_points(const InspectorSpec& spec, bool x_axis, guint canvas, bool position) {
    std::set<GstClockTime> times{0};
    for (const auto& p : spec.scale) times.insert(p.time);
    for (const auto& p : (x_axis ? spec.x : spec.y)) times.insert(p.time);
    std::vector<KeyPoint> out;
    for (const auto time : times) {
        const double scale = clamp(value_at(spec.scale, time, 1.0), 0.01, 8.0);
        const double pos = value_at(x_axis ? spec.x : spec.y, time, 0.0);
        const double size = std::max(1.0, static_cast<double>(canvas) * scale);
        out.push_back({time, position ? ((static_cast<double>(canvas) - size) / 2.0 + pos) : size});
    }
    return out;
}

inline GESEffect* add_top_effect_if_available(GESClip* clip, const char* factory_name,
                                               const std::string& description, std::string& warning) {
    if (!clip || !factory_name) return nullptr;
    GstElementFactory* factory = gst_element_factory_find(factory_name);
    if (!factory) return nullptr;
    gst_object_unref(factory);
    GESEffect* effect = ges_effect_new(description.c_str());
    if (!effect) {
        warning = std::string("GES could not create ") + factory_name + " effect.";
        return nullptr;
    }
    GError* error = nullptr;
    if (!ges_clip_add_top_effect(clip, GES_BASE_EFFECT(effect), -1, &error)) {
        warning = error ? error->message : std::string("GES could not add ") + factory_name + " effect.";
        if (error) g_error_free(error);
        g_object_unref(effect);
        return nullptr;
    }
    return effect;
}

inline GESEffect* ensure_rotation_effect(GESClip* clip, std::string& warning) {
    return add_top_effect_if_available(clip, "rotate", "rotate angle=0", warning);
}

inline bool add_speed_effect(GESClip* clip, GESTrackType type, double speed, std::string& warning) {
    speed = clamp(speed, 0.25, 4.0);
    if (!clip || std::abs(speed - 1.0) < 1e-6) return true;
    std::ostringstream description;
    if (type == GES_TRACK_TYPE_VIDEO) description << "videorate rate=" << speed;
    else if (type == GES_TRACK_TYPE_AUDIO) description << "scaletempo rate=" << speed;
    else return true;
    GESEffect* effect = ges_effect_new(description.str().c_str());
    if (!effect) {
        warning = "GES could not create a speed effect for native preview.";
        return false;
    }
    GError* error = nullptr;
    const bool ok = ges_clip_add_top_effect(clip, GES_BASE_EFFECT(effect), -1, &error);
    if (!ok) warning = error ? error->message : "GES could not add the speed effect.";
    if (error) g_error_free(error);
    if (!ok) g_object_unref(effect);
    return ok;
}

inline bool apply_video_geometry(InspectorRuntime& runtime) {
    if (!runtime.source || !runtime.canvas_width || !runtime.canvas_height) return false;
    const double s = clamp(runtime.scale, 0.01, 8.0);
    const double width = std::max(1.0, runtime.canvas_width * s);
    const double height = std::max(1.0, runtime.canvas_height * s);
    const double posx = (runtime.canvas_width - width) / 2.0 + runtime.x;
    const double posy = (runtime.canvas_height - height) / 2.0 + runtime.y;
    bool ok = true;
    ok = set_child_numeric(GES_TIMELINE_ELEMENT(runtime.source), "width", width) && ok;
    ok = set_child_numeric(GES_TIMELINE_ELEMENT(runtime.source), "height", height) && ok;
    ok = set_child_numeric(GES_TIMELINE_ELEMENT(runtime.source), "posx", posx) && ok;
    ok = set_child_numeric(GES_TIMELINE_ELEMENT(runtime.source), "posy", posy) && ok;
    return ok;
}

inline double color_hue(const InspectorRuntime& runtime) {
    // videobalance does not expose independent temperature/tint channels.
    // Keep native preview perceptually useful while FFmpeg remains export-authoritative.
    return clamp((runtime.tint * 0.70 - runtime.temperature * 0.25) / 100.0 * 0.28, -1.0, 1.0);
}

inline bool apply_color_effect(InspectorRuntime& runtime) {
    if (!runtime.color_track) return false;
    bool ok = true;
    ok = set_child_numeric(GES_TIMELINE_ELEMENT(runtime.color_track), "brightness", clamp(runtime.exposure / 8.0, -0.5, 0.5)) && ok;
    ok = set_child_numeric(GES_TIMELINE_ELEMENT(runtime.color_track), "contrast", clamp(runtime.contrast, 0.25, 4.0)) && ok;
    ok = set_child_numeric(GES_TIMELINE_ELEMENT(runtime.color_track), "saturation", clamp(runtime.saturation, 0.0, 4.0)) && ok;
    ok = set_child_numeric(GES_TIMELINE_ELEMENT(runtime.color_track), "hue", color_hue(runtime)) && ok;
    return ok;
}

inline bool set_live_property(InspectorRuntime& runtime, const std::string& property, double value) {
    if (!runtime.source) return false;
    if (property == "x") { runtime.x = value; return apply_video_geometry(runtime); }
    if (property == "y") { runtime.y = value; return apply_video_geometry(runtime); }
    if (property == "scale") { runtime.scale = clamp(value, 0.01, 8.0); return apply_video_geometry(runtime); }
    if (property == "opacity") {
        runtime.opacity = clamp(value, 0.0, 1.0);
        return set_child_numeric(GES_TIMELINE_ELEMENT(runtime.source), "alpha", runtime.opacity);
    }
    if (property == "volume") {
        runtime.volume = clamp(value, 0.0, 10.0);
        return set_child_numeric(GES_TIMELINE_ELEMENT(runtime.source), "volume", runtime.volume);
    }
    if (property == "rotation" && runtime.rotation_track) {
        runtime.rotation = clamp(value, -360.0, 360.0);
        return set_child_numeric(GES_TIMELINE_ELEMENT(runtime.rotation_track), "angle", runtime.rotation * G_PI / 180.0);
    }
    if (property == "effect.color.exposure") { runtime.exposure = clamp(value, -4.0, 4.0); return apply_color_effect(runtime); }
    if (property == "effect.color.contrast") { runtime.contrast = clamp(value, 0.25, 4.0); return apply_color_effect(runtime); }
    if (property == "effect.color.saturation") { runtime.saturation = clamp(value, 0.0, 4.0); return apply_color_effect(runtime); }
    if (property == "effect.color.temperature") { runtime.temperature = clamp(value, -100.0, 100.0); return apply_color_effect(runtime); }
    if (property == "effect.color.tint") { runtime.tint = clamp(value, -100.0, 100.0); return apply_color_effect(runtime); }
    if (property == "effect.blur.radius" && runtime.blur_track) {
        runtime.blur = clamp(value, 0.0, 50.0);
        return set_child_numeric(GES_TIMELINE_ELEMENT(runtime.blur_track), "sigma", std::max(0.1, runtime.blur / 2.0));
    }
    // Speed changes clip timing. Blur creation/removal, sharpen and vignette are
    // intentionally applied by rebuilding the manifest/export graph.
    return false;
}

inline void release_runtime(InspectorRuntime& runtime) {
    if (runtime.source) { g_object_unref(runtime.source); runtime.source = nullptr; }
    if (runtime.rotation_track) { g_object_unref(runtime.rotation_track); runtime.rotation_track = nullptr; }
    if (runtime.color_track) { g_object_unref(runtime.color_track); runtime.color_track = nullptr; }
    if (runtime.blur_track) { g_object_unref(runtime.blur_track); runtime.blur_track = nullptr; }
    runtime.rotation_effect = nullptr;
    runtime.color_effect = nullptr;
    runtime.blur_effect = nullptr;
    runtime.clip = nullptr;
}

inline bool configure_inspector(GESClip* clip, GESTrackType type, const InspectorSpec& spec,
                                guint canvas_width, guint canvas_height, GstClockTime inpoint,
                                InspectorRuntime& runtime, std::string& warning) {
    runtime.clip = clip;
    runtime.type = type;
    runtime.canvas_width = canvas_width;
    runtime.canvas_height = canvas_height;
    runtime.x = value_at(spec.x, 0, 0.0);
    runtime.y = value_at(spec.y, 0, 0.0);
    runtime.scale = clamp(value_at(spec.scale, 0, 1.0), 0.01, 8.0);
    runtime.rotation = clamp(value_at(spec.rotation, 0, 0.0), -360.0, 360.0);
    runtime.opacity = clamp(value_at(spec.opacity, 0, 1.0), 0.0, 1.0);
    runtime.volume = clamp(value_at(spec.volume, 0, 1.0), 0.0, 10.0);
    runtime.speed = clamp(value_at(spec.speed, 0, 1.0), 0.25, 4.0);
    runtime.exposure = clamp(spec.effects.exposure, -4.0, 4.0);
    runtime.contrast = clamp(spec.effects.contrast, 0.25, 4.0);
    runtime.saturation = clamp(spec.effects.saturation, 0.0, 4.0);
    runtime.temperature = clamp(spec.effects.temperature, -100.0, 100.0);
    runtime.tint = clamp(spec.effects.tint, -100.0, 100.0);
    runtime.blur = clamp(spec.effects.blur, 0.0, 50.0);
    runtime.sharpen = clamp(spec.effects.sharpen, 0.0, 3.0);
    runtime.vignette = clamp(spec.effects.vignette, 0.0, 1.0);

    const GType source_type = type == GES_TRACK_TYPE_VIDEO ? GES_TYPE_VIDEO_SOURCE : GES_TYPE_AUDIO_SOURCE;
    runtime.source = ges_clip_find_track_element(clip, nullptr, source_type);
    if (!runtime.source) {
        warning = "GES could not find the clip source track element.";
        return false;
    }

    add_speed_effect(clip, type, runtime.speed, warning);

    if (type == GES_TRACK_TYPE_VIDEO) {
        apply_video_geometry(runtime);
        set_child_numeric(GES_TIMELINE_ELEMENT(runtime.source), "alpha", runtime.opacity);

        runtime.color_effect = add_top_effect_if_available(clip, "videobalance", "videobalance brightness=0 contrast=1 saturation=1 hue=0", warning);
        if (runtime.color_effect) {
            runtime.color_track = GES_TRACK_ELEMENT(g_object_ref(runtime.color_effect));
            apply_color_effect(runtime);
        }

        if (runtime.blur > 1e-6) {
            std::ostringstream blur_description;
            blur_description << "gaussianblur sigma=" << std::max(0.1, runtime.blur / 2.0);
            runtime.blur_effect = add_top_effect_if_available(clip, "gaussianblur", blur_description.str(), warning);
            if (runtime.blur_effect) runtime.blur_track = GES_TRACK_ELEMENT(g_object_ref(runtime.blur_effect));
        }

        if (!spec.rotation.empty() || std::abs(runtime.rotation) > 1e-6) {
            runtime.rotation_effect = ensure_rotation_effect(clip, warning);
            if (runtime.rotation_effect) {
                runtime.rotation_track = GES_TRACK_ELEMENT(g_object_ref(runtime.rotation_effect));
                set_child_numeric(GES_TIMELINE_ELEMENT(runtime.rotation_track), "angle", runtime.rotation * G_PI / 180.0);
            }
        }

        if (canvas_width && canvas_height) {
            auto widths = derived_geometry_points(spec, true, canvas_width, false);
            auto heights = derived_geometry_points(spec, false, canvas_height, false);
            auto xs = derived_geometry_points(spec, true, canvas_width, true);
            auto ys = derived_geometry_points(spec, false, canvas_height, true);
            if (widths.size() >= 2) bind_points(runtime.source, "width", widths, inpoint, runtime.speed);
            if (heights.size() >= 2) bind_points(runtime.source, "height", heights, inpoint, runtime.speed);
            if (xs.size() >= 2) bind_points(runtime.source, "posx", xs, inpoint, runtime.speed);
            if (ys.size() >= 2) bind_points(runtime.source, "posy", ys, inpoint, runtime.speed);
        }
        if (spec.opacity.size() >= 2) bind_points(runtime.source, "alpha", spec.opacity, inpoint, runtime.speed);
        if (runtime.rotation_track && spec.rotation.size() >= 2)
            bind_points(runtime.rotation_track, "angle", spec.rotation, inpoint, runtime.speed, G_PI / 180.0);
    } else if (type == GES_TRACK_TYPE_AUDIO) {
        set_child_numeric(GES_TIMELINE_ELEMENT(runtime.source), "volume", runtime.volume);
        if (spec.volume.size() >= 2) bind_points(runtime.source, "volume", spec.volume, inpoint, runtime.speed);
    }
    return true;
}

} // namespace directorcut_monitor
