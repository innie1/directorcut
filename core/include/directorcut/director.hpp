#pragma once
#include "directorcut/types.hpp"
#include <string>
#include <vector>

namespace directorcut {
enum class DirectorMode { Ask, CoEdit, Auto };

class DirectorPlanner {
public:
    [[nodiscard]] std::vector<Scene> break_script_into_scenes(const std::string& script) const;
    [[nodiscard]] static std::string mode_name(DirectorMode mode);
};
}
