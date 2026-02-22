cmake_minimum_required(VERSION 3.20)
project(sketchup_csdk_converter CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# SketchUp C SDK 경로.
# 기본값: 이 CMakeLists.txt 옆의 frameworks/ 폴더 (번들된 SDK)
# 외부 SDK를 사용하려면: -DSKETCHUP_SDK_DIR="/path/to/SDK_Mac_2026-1-184"
set(BUNDLED_FRAMEWORKS_DIR "${CMAKE_SOURCE_DIR}/frameworks")
if(SKETCHUP_SDK_DIR STREQUAL "" OR NOT DEFINED SKETCHUP_SDK_DIR)
  set(SKETCHUP_SDK_DIR "${BUNDLED_FRAMEWORKS_DIR}")
endif()

# 헤더 패딩 — install_name_tool 등으로 나중에 rpath를 추가할 수 있도록 여유 공간 확보
add_link_options(-headerpad_max_install_names)

add_executable(sketchup-csdk-converter
  src/main.cpp
)

if(APPLE)
  # macOS SDK는 .framework 형태로 제공됩니다.
  set(SKETCHUP_FRAMEWORK_PATH "${SKETCHUP_SDK_DIR}/SketchUpAPI.framework")
  if(NOT EXISTS "${SKETCHUP_FRAMEWORK_PATH}")
    message(FATAL_ERROR "SketchUpAPI.framework not found at: ${SKETCHUP_FRAMEWORK_PATH}\n"
      "번들된 frameworks/ 폴더가 있는지 확인하거나 -DSKETCHUP_SDK_DIR=/path/to/SDK 로 직접 지정하세요.")
  endif()

  target_include_directories(sketchup-csdk-converter PRIVATE
    "${SKETCHUP_FRAMEWORK_PATH}/Headers"
  )

  # Framework link
  find_library(SKETCHUPAPI_FRAMEWORK SketchUpAPI
    PATHS "${SKETCHUP_SDK_DIR}"
    NO_DEFAULT_PATH
  )
  if(NOT SKETCHUPAPI_FRAMEWORK)
    message(FATAL_ERROR "Failed to find SketchUpAPI framework in: ${SKETCHUP_SDK_DIR}")
  endif()

  target_link_libraries(sketchup-csdk-converter PRIVATE "${SKETCHUPAPI_FRAMEWORK}")

  # 런타임 rpath 설정:
  # 1) @executable_path/../frameworks — 번들된 frameworks/ 폴더 (프로덕션/배포용)
  # 2) 빌드 시에도 동일한 rpath를 사용하도록 CMAKE_BUILD_WITH_INSTALL_RPATH 활성화
  set_target_properties(sketchup-csdk-converter PROPERTIES
    INSTALL_RPATH "@executable_path/../frameworks"
    BUILD_RPATH   "@executable_path/../frameworks"
    CMAKE_BUILD_WITH_INSTALL_RPATH ON
  )
else()
  message(FATAL_ERROR "Only macOS (.framework) skeleton is provided right now.")
endif()

