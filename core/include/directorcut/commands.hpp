#pragma once
#include "directorcut/event_store.hpp"
#include "directorcut/timeline.hpp"
#include <memory>
#include <string>
#include <vector>

namespace directorcut {
class EditCommand {
public:
    virtual ~EditCommand() = default;
    virtual bool execute(Timeline&) = 0;
    virtual void undo(Timeline&) = 0;
    [[nodiscard]] virtual std::string describe() const = 0;
};

class AddClipCommand final : public EditCommand {
public:
    AddClipCommand(std::string track, Clip clip): track_(std::move(track)), clip_(std::move(clip)) {}
    bool execute(Timeline&) override;
    void undo(Timeline&) override;
    std::string describe() const override;
private: std::string track_; Clip clip_; bool done_{false};
};

class RemoveClipCommand final : public EditCommand {
public:
    RemoveClipCommand(std::string track, std::string clip): track_(std::move(track)), clip_id_(std::move(clip)) {}
    bool execute(Timeline&) override;
    void undo(Timeline&) override;
    std::string describe() const override;
private: std::string track_, clip_id_; Clip removed_; bool done_{false};
};

class MoveClipCommand final : public EditCommand {
public:
    MoveClipCommand(std::string track,std::string clip,Millis to): track_(std::move(track)),clip_(std::move(clip)),to_(to){}
    bool execute(Timeline&) override;
    void undo(Timeline&) override;
    std::string describe() const override;
private: std::string track_,clip_; Millis to_{0},from_{0}; bool done_{false};
};

class TrimClipCommand final : public EditCommand {
public:
    TrimClipCommand(std::string track, std::string clip, Millis source_in, Millis source_out)
      : track_(std::move(track)), clip_(std::move(clip)), source_in_(source_in), source_out_(source_out) {}
    bool execute(Timeline&) override;
    void undo(Timeline&) override;
    std::string describe() const override;
private:
    std::string track_, clip_;
    Millis source_in_{0}, source_out_{0}, old_in_{0}, old_out_{0};
    bool done_{false};
};

class SplitClipCommand final : public EditCommand {
public:
    SplitClipCommand(std::string track,std::string clip,Millis at,std::string left,std::string right)
      : track_(std::move(track)),clip_(std::move(clip)),left_(std::move(left)),right_(std::move(right)),at_(at){}
    bool execute(Timeline&) override;
    void undo(Timeline&) override;
    std::string describe() const override;
private: std::string track_,clip_,left_,right_; Millis at_{0}; Clip original_; bool done_{false};
};

class CommandHistory {
public:
    explicit CommandHistory(EventStore* store=nullptr):store_(store){}
    bool apply(std::unique_ptr<EditCommand> command, std::string source="user");
    bool undo();
    bool redo();
    [[nodiscard]] std::size_t undo_depth() const { return done_.size(); }
    [[nodiscard]] std::size_t redo_depth() const { return undone_.size(); }
    [[nodiscard]] const Timeline& timeline() const { return timeline_; }
    Timeline& timeline() { return timeline_; }
private:
    Timeline timeline_;
    EventStore* store_{};
    std::vector<std::unique_ptr<EditCommand>> done_,undone_;
};
}
