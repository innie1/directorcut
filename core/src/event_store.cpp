#include "directorcut/event_store.hpp"
#include <stdexcept>

namespace directorcut {
static void check(int rc, sqlite3* db, const char* what) {
    if (rc != SQLITE_OK && rc != SQLITE_DONE && rc != SQLITE_ROW) {
        throw std::runtime_error(std::string(what) + ": " + sqlite3_errmsg(db));
    }
}

EventStore::EventStore(const std::string& db_path) {
    check(sqlite3_open(db_path.c_str(), &db_), db_, "open sqlite");
    exec("PRAGMA journal_mode=WAL;");
    exec("CREATE TABLE IF NOT EXISTS learning_events("
         "id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,"
         "kind TEXT NOT NULL, context TEXT, proposal TEXT, user_action TEXT, replacement TEXT);");
    exec("CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
}
EventStore::~EventStore(){ if (db_) sqlite3_close(db_); }
void EventStore::exec(const char* sql) const { check(sqlite3_exec(db_, sql, nullptr, nullptr, nullptr), db_, "sqlite exec"); }

void EventStore::record_learning_event(const LearningEvent& e) {
    sqlite3_stmt* stmt = nullptr;
    const char* sql = "INSERT INTO learning_events(kind,context,proposal,user_action,replacement) VALUES(?,?,?,?,?)";
    check(sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr), db_, "prepare event");
    sqlite3_bind_text(stmt,1,e.kind.c_str(),-1,SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt,2,e.context.c_str(),-1,SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt,3,e.proposal.c_str(),-1,SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt,4,e.user_action.c_str(),-1,SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt,5,e.replacement.c_str(),-1,SQLITE_TRANSIENT);
    check(sqlite3_step(stmt), db_, "insert event");
    sqlite3_finalize(stmt);
}

std::vector<LearningEvent> EventStore::recent_learning_events(int limit) const {
    sqlite3_stmt* stmt = nullptr;
    check(sqlite3_prepare_v2(db_, "SELECT id,created_at,kind,context,proposal,user_action,replacement FROM learning_events ORDER BY id DESC LIMIT ?", -1, &stmt, nullptr), db_, "prepare read events");
    sqlite3_bind_int(stmt,1,limit);
    std::vector<LearningEvent> out;
    while (sqlite3_step(stmt)==SQLITE_ROW) {
        auto text=[&](int i){ const auto* p=sqlite3_column_text(stmt,i); return p?std::string(reinterpret_cast<const char*>(p)):std::string{}; };
        out.push_back({sqlite3_column_int64(stmt,0),text(1),text(2),text(3),text(4),text(5),text(6)});
    }
    sqlite3_finalize(stmt);
    return out;
}

void EventStore::set_preference(const std::string& key, const std::string& value) {
    sqlite3_stmt* stmt=nullptr;
    check(sqlite3_prepare_v2(db_, "INSERT INTO preferences(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP", -1, &stmt, nullptr), db_, "prepare preference");
    sqlite3_bind_text(stmt,1,key.c_str(),-1,SQLITE_TRANSIENT);
    sqlite3_bind_text(stmt,2,value.c_str(),-1,SQLITE_TRANSIENT);
    check(sqlite3_step(stmt), db_, "set preference");
    sqlite3_finalize(stmt);
}

std::string EventStore::preference(const std::string& key) const {
    sqlite3_stmt* stmt=nullptr;
    check(sqlite3_prepare_v2(db_, "SELECT value FROM preferences WHERE key=?", -1, &stmt, nullptr), db_, "prepare preference read");
    sqlite3_bind_text(stmt,1,key.c_str(),-1,SQLITE_TRANSIENT);
    std::string out;
    if (sqlite3_step(stmt)==SQLITE_ROW) {
        const auto* p=sqlite3_column_text(stmt,0); if(p) out=reinterpret_cast<const char*>(p);
    }
    sqlite3_finalize(stmt);
    return out;
}
}
