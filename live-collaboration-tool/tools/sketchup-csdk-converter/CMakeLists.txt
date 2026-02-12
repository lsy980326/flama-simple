cmake_minimum_required(VERSION 3.20)
project(sketchup_csdk_converter CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 사용자가 설치한 SketchUp C SDK 경로를 전달해야 합니다.
# 예(macOS): -DSKETCHUP_SDK_DIR="/path/to/SDK_Mac_2026-1-184"
set(SKETCHUP_SDK_DIR "" CACHE PATH "Path to SketchUp C SDK root directory")

if(SKETCHUP_SDK_DIR STREQUAL "")
  message(FATAL_ERROR "SKETCHUP_SDK_DIR is required. Pass -DSKETCHUP_SDK_DIR=/path/to/SketchUpCSDK")
endif()

add_executable(sketchup-csdk-converter
  src/main.cpp
)

if(APPLE)
  # macOS SDK는 .framework 형태로 제공됩니다.
  set(SKETCHUP_FRAMEWORK_PATH "${SKETCHUP_SDK_DIR}/SketchUpAPI.framework")
  if(NOT EXISTS "${SKETCHUP_FRAMEWORK_PATH}")
    message(FATAL_ERROR "SketchUpAPI.framework not found at: ${SKETCHUP_FRAMEWORK_PATH}")
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

  # 런타임에 SDK 프레임워크 내부의 의존 dylib들을 찾을 수 있도록 rpath 추가
  set_target_properties(sketchup-csdk-converter PROPERTIES
    BUILD_RPATH "${SKETCHUP_FRAMEWORK_PATH}/Versions/A;${SKETCHUP_FRAMEWORK_PATH}/Versions/A/Frameworks"
  )
else()
  message(FATAL_ERROR "Only macOS (.framework) skeleton is provided right now.")
endif()

