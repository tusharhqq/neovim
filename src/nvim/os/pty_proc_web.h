#pragma once
// IWYU pragma: private, include "nvim/os/pty_proc.h"

#include <stdint.h>

#include "nvim/event/defs.h"

typedef struct {
  Proc proc;
  uint16_t width, height;
  int tty_fd;
} PtyProc;

#include "os/pty_proc_web.h.generated.h"
