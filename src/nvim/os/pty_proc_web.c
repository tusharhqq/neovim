#include <assert.h>
#include <stdint.h>
#include <uv.h>

#include "nvim/event/loop.h"
#include "nvim/event/proc.h"
#include "nvim/os/pty_proc.h"
#include "nvim/os/pty_proc_web.h"

#include "os/pty_proc_web.c.generated.h"

int pty_proc_spawn(PtyProc *ptyproc)
{
  (void)ptyproc;
  return UV_ENOSYS;
}

const char *pty_proc_tty_name(PtyProc *ptyproc)
{
  (void)ptyproc;
  return NULL;
}

void pty_proc_resize(PtyProc *ptyproc, uint16_t width, uint16_t height)
{
  (void)ptyproc;
  (void)width;
  (void)height;
}

void pty_proc_resume(PtyProc *ptyproc)
{
  (void)ptyproc;
}

void pty_proc_flush_master(PtyProc *ptyproc)
{
  (void)ptyproc;
}

void pty_proc_close(PtyProc *ptyproc)
{
  pty_proc_close_master(ptyproc);
  Proc *proc = (Proc *)ptyproc;
  if (proc->internal_close_cb) {
    proc->internal_close_cb(proc);
  }
}

void pty_proc_close_master(PtyProc *ptyproc)
{
  (void)ptyproc;
}

void pty_proc_teardown(Loop *loop)
{
  (void)loop;
}

PtyProc pty_proc_init(Loop *loop, void *data)
{
  PtyProc rv = { 0 };
  rv.proc = proc_init(loop, kProcTypePty, data);
  rv.width = 80;
  rv.height = 24;
  rv.tty_fd = -1;
  return rv;
}
