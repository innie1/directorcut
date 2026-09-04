#include "directorcut/commands.hpp"
#include <sstream>

namespace directorcut {
bool AddClipCommand::execute(Timeline& t){ done_=t.add_clip(track_,clip_); return done_; }
void AddClipCommand::undo(Timeline& t){ if(done_) t.remove_clip(track_,clip_.id); }
std::string AddClipCommand::describe() const { return "add_clip:"+clip_.id+" -> "+track_; }

bool RemoveClipCommand::execute(Timeline& t){ done_=t.remove_clip(track_,clip_id_,&removed_); return done_; }
void RemoveClipCommand::undo(Timeline& t){ if(done_) t.add_clip(track_,removed_); }
std::string RemoveClipCommand::describe() const { return "remove_clip:"+clip_id_+" <- "+track_; }

bool MoveClipCommand::execute(Timeline& t){ done_=t.move_clip(track_,clip_,to_,&from_); return done_; }
void MoveClipCommand::undo(Timeline& t){ if(done_) t.move_clip(track_,clip_,from_); }
std::string MoveClipCommand::describe() const { return "move_clip:"+clip_+" -> "+std::to_string(to_)+"ms"; }

bool TrimClipCommand::execute(Timeline& t){
    done_=t.trim_clip(track_,clip_,source_in_,source_out_,&old_in_,&old_out_);
    return done_;
}
void TrimClipCommand::undo(Timeline& t){ if(done_) t.trim_clip(track_,clip_,old_in_,old_out_); }
std::string TrimClipCommand::describe() const {
    return "trim_clip:"+clip_+" ["+std::to_string(source_in_)+","+std::to_string(source_out_)+"]ms";
}

bool SplitClipCommand::execute(Timeline& t){ done_=t.split_clip(track_,clip_,at_,left_,right_,&original_); return done_; }
void SplitClipCommand::undo(Timeline& t){ if(!done_) return; t.remove_clip(track_,left_); t.remove_clip(track_,right_); t.add_clip(track_,original_); }
std::string SplitClipCommand::describe() const { return "split_clip:"+clip_+" @ "+std::to_string(at_)+"ms"; }

bool CommandHistory::apply(std::unique_ptr<EditCommand> c, std::string source) {
    if(!c->execute(timeline_)) return false;
    if(store_) store_->record_learning_event({0,"","edit","timeline",c->describe(),std::move(source),""});
    done_.push_back(std::move(c)); undone_.clear(); return true;
}
bool CommandHistory::undo(){ if(done_.empty()) return false; auto c=std::move(done_.back()); done_.pop_back(); c->undo(timeline_); undone_.push_back(std::move(c)); return true; }
bool CommandHistory::redo(){ if(undone_.empty()) return false; auto c=std::move(undone_.back()); undone_.pop_back(); if(!c->execute(timeline_)) return false; done_.push_back(std::move(c)); return true; }
}
