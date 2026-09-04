#pragma once
#include <sqlite3.h>
#include <string>
#include <vector>

namespace directorcut {
struct LearningEvent {
    long long id{0};
    std::string created_at;
    std::string kind;
    std::string context;
    std::string proposal;
    std::string user_action;
    std::string replacement;
};

class EventStore {
public:
    explicit EventStore(const std::string& db_path);
    ~EventStore();
    EventStore(const EventStore&) = delete;
    EventStore& operator=(const EventStore&) = delete;

    void record_learning_event(const LearningEvent& event);
    [[nodiscard]] std::vector<LearningEvent> recent_learning_events(int limit = 50) const;
    void set_preference(const std::string& key, const std::string& value);
    [[nodiscard]] std::string preference(const std::string& key) const;

private:
    sqlite3* db_{nullptr};
    void exec(const char* sql) const;
};
}
