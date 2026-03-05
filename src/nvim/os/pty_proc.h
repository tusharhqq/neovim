#pragma once

#ifdef NVIM_WEB
# include "nvim/os/pty_proc_web.h"
#elif defined(MSWIN)
# include "nvim/os/pty_proc_win.h"
#else
# include "nvim/os/pty_proc_unix.h"
#endif
