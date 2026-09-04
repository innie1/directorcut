#pragma once
#include "directorcut/types.hpp"
#include <optional>
#include <string>
#include <vector>

namespace directorcut {
struct TranscriptMatch { Millis start_ms{0}; Millis end_ms{0}; std::string excerpt; };
class TranscriptIndex {
public:
    void add_word(TranscriptWord word);
    [[nodiscard]] std::vector<TranscriptMatch> find_phrase(const std::string& phrase) const;
    [[nodiscard]] const std::vector<TranscriptWord>& words() const { return words_; }
private: std::vector<TranscriptWord> words_;
};
}
