cmake_minimum_required(VERSION 3.20)
project(DirectorCut VERSION 0.2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(DIRECTORCUT_BUILD_TESTS "Build tests" ON)
option(DIRECTORCUT_BUILD_QT_UI "Build Qt/QML desktop shell when Qt 6 is available" ON)

find_package(SQLite3 REQUIRED)

add_library(directorcut_core
    core/src/timeline.cpp
    core/src/commands.cpp
    core/src/event_store.cpp
    core/src/director.cpp
    core/src/transcript.cpp
    core/src/media.cpp
)
target_include_directories(directorcut_core PUBLIC core/include)
target_link_libraries(directorcut_core PUBLIC SQLite::SQLite3)
if (MSVC)
  target_compile_options(directorcut_core PRIVATE /W4 /permissive-)
else()
  target_compile_options(directorcut_core PRIVATE -Wall -Wextra -Wpedantic)
endif()

add_executable(directorcut apps/cli/main.cpp)
target_link_libraries(directorcut PRIVATE directorcut_core)

if (DIRECTORCUT_BUILD_TESTS)
  enable_testing()
  add_executable(directorcut_tests tests/test_core.cpp)
  target_link_libraries(directorcut_tests PRIVATE directorcut_core)
  add_test(NAME directorcut_core_tests COMMAND directorcut_tests)
endif()

if (DIRECTORCUT_BUILD_QT_UI)
  find_package(Qt6 QUIET COMPONENTS Quick Qml QuickControls2)
  if (Qt6_FOUND)
    qt_add_executable(directorcut_desktop native-ui/main.cpp)
    qt_add_qml_module(directorcut_desktop
      URI DirectorCut
      VERSION 1.0
      QML_FILES native-ui/Main.qml
    )
    target_link_libraries(directorcut_desktop PRIVATE Qt6::Quick Qt6::Qml Qt6::QuickControls2 directorcut_core)
  else()
    message(STATUS "Qt 6 not found: building core + CLI only. QML desktop source remains in native-ui/.")
  endif()
endif()
