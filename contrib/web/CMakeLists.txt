if(NOT ENABLE_WEB)
  return()
endif()

set(WEB_DIST_DIR "${CMAKE_BINARY_DIR}/web/dist")
set(WEB_SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}")

set(WEB_ASSETS
  "${WEB_SRC_DIR}/index.html"
  "${WEB_SRC_DIR}/app.js"
  "${WEB_SRC_DIR}/nvim.worker.js"
  "${WEB_SRC_DIR}/msgpack.js")

add_custom_command(
  OUTPUT
    "${WEB_DIST_DIR}/index.html"
    "${WEB_DIST_DIR}/app.js"
    "${WEB_DIST_DIR}/nvim.worker.js"
    "${WEB_DIST_DIR}/msgpack.js"
    "${WEB_DIST_DIR}/nvim.js"
    "${WEB_DIST_DIR}/nvim.wasm"
    "${WEB_DIST_DIR}/SMOKE_TEST_REPORT.md"
  COMMAND ${CMAKE_COMMAND} -E make_directory "${WEB_DIST_DIR}"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different "${WEB_SRC_DIR}/index.html" "${WEB_DIST_DIR}/index.html"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different "${WEB_SRC_DIR}/app.js" "${WEB_DIST_DIR}/app.js"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different "${WEB_SRC_DIR}/nvim.worker.js" "${WEB_DIST_DIR}/nvim.worker.js"
  COMMAND ${CMAKE_COMMAND} -E copy_if_different "${WEB_SRC_DIR}/msgpack.js" "${WEB_DIST_DIR}/msgpack.js"
  COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:nvim_bin>" "${WEB_DIST_DIR}/nvim.js"
  COMMAND ${CMAKE_COMMAND}
    -D SRC="$<TARGET_FILE_DIR:nvim_bin>/$<TARGET_FILE_BASE_NAME:nvim_bin>.wasm"
    -D DST="${WEB_DIST_DIR}/nvim.wasm"
    -P "${WEB_SRC_DIR}/copy_if_exists.cmake"
  COMMAND ${CMAKE_COMMAND}
    -D SRC="$<TARGET_FILE_DIR:nvim_bin>/$<TARGET_FILE_BASE_NAME:nvim_bin>.data"
    -D DST="${WEB_DIST_DIR}/nvim.data"
    -P "${WEB_SRC_DIR}/copy_if_exists.cmake"
  COMMAND ${CMAKE_COMMAND} -E copy_directory "${PROJECT_SOURCE_DIR}/runtime" "${WEB_DIST_DIR}/runtime"
  COMMAND ${CMAKE_COMMAND}
    -D OUT="${WEB_DIST_DIR}/SMOKE_TEST_REPORT.md"
    -P "${WEB_SRC_DIR}/write_smoke_report.cmake"
  DEPENDS nvim_bin ${WEB_ASSETS}
  VERBATIM)

add_custom_target(nvim_web_bundle DEPENDS
  "${WEB_DIST_DIR}/index.html"
  "${WEB_DIST_DIR}/app.js"
  "${WEB_DIST_DIR}/nvim.worker.js"
  "${WEB_DIST_DIR}/msgpack.js"
  "${WEB_DIST_DIR}/nvim.js"
  "${WEB_DIST_DIR}/nvim.wasm"
  "${WEB_DIST_DIR}/SMOKE_TEST_REPORT.md")
