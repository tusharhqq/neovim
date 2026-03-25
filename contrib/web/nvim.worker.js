'use strict';

importScripts('./msgpack.js');
importScripts('./nvim.js');

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let nvimModule = null;
let started = false;
let attached = false;
let stderrLine = '';

const stdinQueue = [];
const pending = new Map();
const deferredMessages = [];
let nextMessageId = 1;

const decoder = new NvimMsgpack.DecoderStream(onRpcMessage);

function enqueueBytes(bytes) {
  for (let i = 0; i < bytes.length; i++) {
    stdinQueue.push(bytes[i]);
  }
}

function sendRpcMessage(message) {
  enqueueBytes(NvimMsgpack.encode(message));
}

function sendRpcRequest(method, params) {
  const id = nextMessageId++;
  sendRpcMessage([0, id, method, params]);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
  });
}

function onRpcMessage(message) {
  if (!Array.isArray(message) || message.length < 3) {
    return;
  }

  const kind = message[0];
  if (kind === 1) {
    const id = message[1];
    const err = message[2];
    const result = message[3];
    const slot = pending.get(id);
    if (!slot) {
      return;
    }
    pending.delete(id);
    if (err) {
      slot.reject(new Error('RPC error for ' + slot.method + ': ' + JSON.stringify(err)));
      return;
    }
    slot.resolve(result);
    return;
  }

  if (kind === 2) {
    const method = message[1];
    const params = message[2];
    if (method === 'redraw') {
      postMessage({ type: 'redraw', events: params });
      return;
    }
    if (method === 'nvim_error_event') {
      postMessage({ type: 'log', level: 'error', message: JSON.stringify(params) });
      return;
    }
  }
}

function stdoutCallback(byte) {
  decoder.feedByte(byte);
}

function stderrCallback(byte) {
  if (byte === 10) {
    if (stderrLine.length > 0) {
      postMessage({ type: 'log', level: 'stderr', message: stderrLine });
      stderrLine = '';
    }
    return;
  }
  stderrLine += String.fromCharCode(byte);
}

function stdinCallback() {
  if (stdinQueue.length === 0) {
    return null;
  }
  return stdinQueue.shift();
}

function ensureDir(path) {
  const parts = path.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    try {
      nvimModule.FS.mkdir(current);
    } catch (_) {
      // ignore EEXIST
    }
  }
}

function syncFs(populate) {
  return new Promise((resolve, reject) => {
    nvimModule.FS.syncfs(populate, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function attachUi(cols, rows) {
  if (attached) {
    await sendRpcRequest('nvim_ui_try_resize', [cols, rows]);
    return;
  }
  await sendRpcRequest('nvim_ui_attach', [cols, rows, {
    rgb: true,
    ext_linegrid: true,
    ext_termcolors: true,
  }]);
  attached = true;
}

async function boot(cols, rows) {
  if (started) {
    return;
  }
  started = true;

  nvimModule = await createNvimModule({
    noInitialRun: true,
    stdin: stdinCallback,
    stdout: stdoutCallback,
    stderr: stderrCallback,
  });

  ensureDir('/home/web_user');
  try {
    nvimModule.FS.mount(nvimModule.FS.filesystems.IDBFS, {}, '/home/web_user');
  } catch (_) {
    // mount can be reused in some restart cases
  }

  await syncFs(true);
  nvimModule.ENV.HOME = '/home/web_user';
  nvimModule.ENV.VIMRUNTIME = '/runtime';
  nvimModule.FS.chdir('/home/web_user');
  nvimModule.callMain(['--embed', '--headless', '--clean', '-u', 'NONE', '-i', 'NONE']);

  await attachUi(cols, rows);
  await sendRpcRequest('nvim_command', ['set shortmess+=I noswapfile']);
  postMessage({ type: 'ready' });

  while (deferredMessages.length > 0) {
    // Handle user events queued while startup was in progress.
    // eslint-disable-next-line no-await-in-loop
    await handleMessage(deferredMessages.shift());
  }
}

async function writeFile(path, content) {
  const parent = path.substring(0, path.lastIndexOf('/'));
  if (parent) {
    ensureDir(parent);
  }
  nvimModule.FS.writeFile(path, textEncoder.encode(content));
  await syncFs(false);
}

async function readFile(path) {
  const content = nvimModule.FS.readFile(path);
  return textDecoder.decode(content);
}

async function handleMessage(data) {
  switch (data.type) {
  case 'start':
    await boot(data.cols, data.rows);
    break;
  case 'input':
    await sendRpcRequest('nvim_input', [data.keys]);
    break;
  case 'command':
    await sendRpcRequest('nvim_command', [data.command]);
    break;
  case 'resize':
    await attachUi(data.cols, data.rows);
    break;
  case 'writeFile':
    await writeFile(data.path, data.content);
    postMessage({ type: 'writeFileDone', path: data.path });
    break;
  case 'readFile': {
    const content = await readFile(data.path);
    postMessage({ type: 'readFileDone', path: data.path, content: content });
    break;
  }
  case 'syncfs':
    await syncFs(false);
    postMessage({ type: 'syncDone' });
    break;
  default:
    postMessage({ type: 'log', level: 'warn', message: 'Unknown worker message: ' + data.type });
    break;
  }
}

self.onmessage = async (event) => {
  try {
    if ((!started && event.data.type !== 'start')
      || (started && !attached && event.data.type !== 'start')) {
      deferredMessages.push(event.data);
      return;
    }
    await handleMessage(event.data);
  } catch (err) {
    postMessage({
      type: 'error',
      message: err && err.message ? err.message : String(err),
    });
  }
};
