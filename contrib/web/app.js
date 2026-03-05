'use strict';

const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const canvas = document.getElementById('screen');
const openBtn = document.getElementById('openBtn');
const saveBtn = document.getElementById('saveBtn');
const helpBtn = document.getElementById('helpBtn');
const filePicker = document.getElementById('filePicker');
const ctx = canvas.getContext('2d');

const worker = new Worker('./nvim.worker.js');
const grids = new Map();
let cursor = { grid: 1, row: 0, col: 0 };
let currentPath = '';
let ready = false;

const CELL_WIDTH = 9;
const CELL_HEIGHT = 18;
const FONT = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

function log(message) {
  const now = new Date().toISOString().slice(11, 19);
  logEl.textContent += `[${now}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text, isReady) {
  statusEl.textContent = text;
  statusEl.classList.toggle('ready', Boolean(isReady));
}

function ensureGrid(gridId, width, height) {
  let grid = grids.get(gridId);
  if (!grid) {
    grid = { width: 0, height: 0, rows: [] };
    grids.set(gridId, grid);
  }
  if (grid.width === width && grid.height === height && grid.rows.length > 0) {
    return grid;
  }
  grid.width = width;
  grid.height = height;
  grid.rows = new Array(height);
  for (let r = 0; r < height; r++) {
    grid.rows[r] = new Array(width).fill(' ');
  }
  if (gridId === 1) {
    canvas.width = Math.max(1, width * CELL_WIDTH);
    canvas.height = Math.max(1, height * CELL_HEIGHT);
  }
  return grid;
}

function handleGridLine(args) {
  const grid = ensureGrid(args[0], 1, 1);
  const row = args[1];
  let col = args[2];
  const cells = args[3] || [];
  if (!grid.rows[row]) {
    return;
  }
  for (const cell of cells) {
    const text = cell[0] || ' ';
    const repeat = cell[2] || 1;
    for (let i = 0; i < repeat && col < grid.width; i++) {
      grid.rows[row][col] = text;
      col += 1;
    }
  }
}

function handleGridScroll(args) {
  const grid = grids.get(args[0]);
  if (!grid) {
    return;
  }
  const top = args[1];
  const bot = args[2];
  const left = args[3];
  const right = args[4];
  const rows = args[5];
  if (rows === 0) {
    return;
  }

  if (rows > 0) {
    for (let r = top; r < bot - rows; r++) {
      for (let c = left; c < right; c++) {
        grid.rows[r][c] = grid.rows[r + rows][c];
      }
    }
    for (let r = bot - rows; r < bot; r++) {
      for (let c = left; c < right; c++) {
        grid.rows[r][c] = ' ';
      }
    }
  } else {
    const count = -rows;
    for (let r = bot - 1; r >= top + count; r--) {
      for (let c = left; c < right; c++) {
        grid.rows[r][c] = grid.rows[r - count][c];
      }
    }
    for (let r = top; r < top + count; r++) {
      for (let c = left; c < right; c++) {
        grid.rows[r][c] = ' ';
      }
    }
  }
}

function render() {
  const main = grids.get(1);
  if (!main) {
    return;
  }

  ctx.fillStyle = '#090d14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#dbe8f8';

  for (let row = 0; row < main.height; row++) {
    const line = main.rows[row] ? main.rows[row].join('') : '';
    ctx.fillText(line, 0, row * CELL_HEIGHT + 2);
  }

  if (cursor.grid === 1) {
    const x = cursor.col * CELL_WIDTH;
    const y = cursor.row * CELL_HEIGHT;
    ctx.fillStyle = 'rgba(74, 212, 156, 0.35)';
    ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT);
  }
}

function normalizeRedrawPayload(events) {
  if (Array.isArray(events) && events.length === 1 && Array.isArray(events[0]) && Array.isArray(events[0][0])) {
    return events[0];
  }
  return events;
}

function applyRedraw(events) {
  const payload = normalizeRedrawPayload(events);
  for (const event of payload) {
    const name = event[0];
    const args = event.slice(1);

    switch (name) {
    case 'grid_resize':
      for (const item of args) {
        ensureGrid(item[0], item[1], item[2]);
      }
      break;
    case 'grid_clear':
      for (const item of args) {
        const grid = grids.get(item[0]);
        if (!grid) {
          continue;
        }
        for (let r = 0; r < grid.height; r++) {
          grid.rows[r].fill(' ');
        }
      }
      break;
    case 'grid_line':
      for (const item of args) {
        handleGridLine(item);
      }
      break;
    case 'grid_scroll':
      for (const item of args) {
        handleGridScroll(item);
      }
      break;
    case 'grid_cursor_goto':
      for (const item of args) {
        cursor = { grid: item[0], row: item[1], col: item[2] };
      }
      break;
    case 'flush':
      render();
      break;
    default:
      break;
    }
  }
}

function toNvimKey(event) {
  const key = event.key;
  const specials = {
    Enter: '<CR>',
    Backspace: '<BS>',
    Tab: '<Tab>',
    Escape: '<Esc>',
    ArrowUp: '<Up>',
    ArrowDown: '<Down>',
    ArrowLeft: '<Left>',
    ArrowRight: '<Right>',
    Home: '<Home>',
    End: '<End>',
    PageUp: '<PageUp>',
    PageDown: '<PageDown>',
    Delete: '<Del>',
    Insert: '<Insert>',
  };

  if (specials[key]) {
    return specials[key];
  }

  if (event.ctrlKey && key.length === 1) {
    return `<C-${key.toLowerCase()}>`;
  }

  if (event.altKey && key.length === 1) {
    return `<A-${key}>`;
  }

  if (!event.ctrlKey && !event.metaKey && key.length === 1) {
    return key;
  }

  return null;
}

function send(msg) {
  worker.postMessage(msg);
}

function computeGridSize() {
  const width = Math.max(40, Math.floor((canvas.clientWidth || window.innerWidth - 32) / CELL_WIDTH));
  const height = Math.max(12, Math.floor((window.innerHeight - 180) / CELL_HEIGHT));
  return { cols: width, rows: height };
}

canvas.addEventListener('keydown', (event) => {
  if (!ready) {
    return;
  }
  const nvimKey = toNvimKey(event);
  if (!nvimKey) {
    return;
  }
  event.preventDefault();
  send({ type: 'input', keys: nvimKey });
});

canvas.addEventListener('click', () => {
  canvas.focus();
});

window.addEventListener('resize', () => {
  const size = computeGridSize();
  send({ type: 'resize', cols: size.cols, rows: size.rows });
});

openBtn.addEventListener('click', () => {
  filePicker.click();
});

filePicker.addEventListener('change', async () => {
  const file = filePicker.files[0];
  if (!file) {
    return;
  }
  const content = await file.text();
  currentPath = '/home/web_user/' + file.name;
  send({ type: 'writeFile', path: currentPath, content: content });
  send({ type: 'command', command: 'edit ' + currentPath.replace(/ /g, '\\ ') });
  filePicker.value = '';
});

saveBtn.addEventListener('click', () => {
  const cmd = currentPath ? ('write ' + currentPath.replace(/ /g, '\\ ')) : 'write';
  send({ type: 'command', command: cmd });
  send({ type: 'syncfs' });
});

helpBtn.addEventListener('click', () => {
  send({ type: 'command', command: 'help' });
  canvas.focus();
});

worker.onmessage = (event) => {
  const data = event.data;
  switch (data.type) {
  case 'ready':
    ready = true;
    setStatus('Connected', true);
    window.__nvimConnected = true;
    canvas.focus();
    log('Neovim web worker ready.');
    break;
  case 'redraw':
    applyRedraw(data.events);
    break;
  case 'writeFileDone':
    log('Loaded file into VFS: ' + data.path);
    break;
  case 'readFileDone':
    log('Read file: ' + data.path + ' (' + data.content.length + ' bytes)');
    break;
  case 'syncDone':
    log('Synced VFS to IndexedDB.');
    break;
  case 'log':
    log((data.level || 'log') + ': ' + data.message);
    break;
  case 'error':
    setStatus('Error', false);
    log('error: ' + data.message);
    break;
  default:
    break;
  }
};

setStatus('Booting...', false);
window.__nvimConnected = false;
const initialSize = computeGridSize();
send({ type: 'start', cols: initialSize.cols, rows: initialSize.rows });
