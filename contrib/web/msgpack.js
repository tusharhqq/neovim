(function (global) {
  'use strict';

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function concat(chunks) {
    let size = 0;
    for (const chunk of chunks) {
      size += chunk.length;
    }
    const out = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  function encodeUInt32(value) {
    const out = new Uint8Array(5);
    out[0] = 0xce;
    out[1] = (value >>> 24) & 0xff;
    out[2] = (value >>> 16) & 0xff;
    out[3] = (value >>> 8) & 0xff;
    out[4] = value & 0xff;
    return out;
  }

  function encodeInt32(value) {
    const out = new Uint8Array(5);
    out[0] = 0xd2;
    out[1] = (value >>> 24) & 0xff;
    out[2] = (value >>> 16) & 0xff;
    out[3] = (value >>> 8) & 0xff;
    out[4] = value & 0xff;
    return out;
  }

  function encode(value) {
    if (value === null || value === undefined) {
      return new Uint8Array([0xc0]);
    }
    if (value === false) {
      return new Uint8Array([0xc2]);
    }
    if (value === true) {
      return new Uint8Array([0xc3]);
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        if (value >= 0 && value <= 0x7f) {
          return new Uint8Array([value]);
        }
        if (value < 0 && value >= -32) {
          return new Uint8Array([0xe0 | (value + 32)]);
        }
        if (value >= 0 && value <= 0xff) {
          return new Uint8Array([0xcc, value]);
        }
        if (value >= 0 && value <= 0xffff) {
          return new Uint8Array([0xcd, (value >>> 8) & 0xff, value & 0xff]);
        }
        if (value >= 0 && value <= 0xffffffff) {
          return encodeUInt32(value >>> 0);
        }
        if (value >= -0x80 && value <= -1) {
          return new Uint8Array([0xd0, value & 0xff]);
        }
        if (value >= -0x8000 && value <= -0x81) {
          return new Uint8Array([0xd1, (value >>> 8) & 0xff, value & 0xff]);
        }
        if (value >= -0x80000000 && value <= -0x8001) {
          return encodeInt32(value | 0);
        }
      }
      const out = new Uint8Array(9);
      out[0] = 0xcb;
      const view = new DataView(out.buffer);
      view.setFloat64(1, value);
      return out;
    }
    if (typeof value === 'string') {
      const bytes = textEncoder.encode(value);
      const len = bytes.length;
      if (len <= 31) {
        const out = new Uint8Array(1 + len);
        out[0] = 0xa0 | len;
        out.set(bytes, 1);
        return out;
      }
      if (len <= 0xff) {
        const out = new Uint8Array(2 + len);
        out[0] = 0xd9;
        out[1] = len;
        out.set(bytes, 2);
        return out;
      }
      const out = new Uint8Array(3 + len);
      out[0] = 0xda;
      out[1] = (len >>> 8) & 0xff;
      out[2] = len & 0xff;
      out.set(bytes, 3);
      return out;
    }
    if (value instanceof Uint8Array) {
      const len = value.length;
      if (len <= 0xff) {
        const out = new Uint8Array(2 + len);
        out[0] = 0xc4;
        out[1] = len;
        out.set(value, 2);
        return out;
      }
      const out = new Uint8Array(3 + len);
      out[0] = 0xc5;
      out[1] = (len >>> 8) & 0xff;
      out[2] = len & 0xff;
      out.set(value, 3);
      return out;
    }
    if (Array.isArray(value)) {
      const items = value.map(encode);
      const payload = concat(items);
      const len = value.length;
      if (len <= 15) {
        const out = new Uint8Array(1 + payload.length);
        out[0] = 0x90 | len;
        out.set(payload, 1);
        return out;
      }
      if (len <= 0xffff) {
        const out = new Uint8Array(3 + payload.length);
        out[0] = 0xdc;
        out[1] = (len >>> 8) & 0xff;
        out[2] = len & 0xff;
        out.set(payload, 3);
        return out;
      }
      throw new Error('Array too large for encoder');
    }
    if (isObject(value)) {
      const keys = Object.keys(value);
      const chunks = [];
      for (const key of keys) {
        chunks.push(encode(key));
        chunks.push(encode(value[key]));
      }
      const payload = concat(chunks);
      const len = keys.length;
      if (len <= 15) {
        const out = new Uint8Array(1 + payload.length);
        out[0] = 0x80 | len;
        out.set(payload, 1);
        return out;
      }
      if (len <= 0xffff) {
        const out = new Uint8Array(3 + payload.length);
        out[0] = 0xde;
        out[1] = (len >>> 8) & 0xff;
        out[2] = len & 0xff;
        out.set(payload, 3);
        return out;
      }
      throw new Error('Map too large for encoder');
    }
    throw new Error('Unsupported msgpack type: ' + typeof value);
  }

  function decodeAt(bytes, offset, limit) {
    if (offset >= limit) {
      return null;
    }
    const head = bytes[offset];

    function needs(size) {
      return offset + size <= limit;
    }

    function parseString(len, headerSize) {
      if (!needs(headerSize + len)) {
        return null;
      }
      const start = offset + headerSize;
      const end = start + len;
      const value = textDecoder.decode(bytes.subarray(start, end));
      return { value: value, next: end };
    }

    function parseArray(len, headerSize) {
      let next = offset + headerSize;
      const out = new Array(len);
      for (let i = 0; i < len; i++) {
        const inner = decodeAt(bytes, next, limit);
        if (!inner) {
          return null;
        }
        out[i] = inner.value;
        next = inner.next;
      }
      return { value: out, next: next };
    }

    function parseMap(len, headerSize) {
      let next = offset + headerSize;
      const out = {};
      for (let i = 0; i < len; i++) {
        const k = decodeAt(bytes, next, limit);
        if (!k) {
          return null;
        }
        next = k.next;
        const v = decodeAt(bytes, next, limit);
        if (!v) {
          return null;
        }
        next = v.next;
        out[String(k.value)] = v.value;
      }
      return { value: out, next: next };
    }

    if (head <= 0x7f) {
      return { value: head, next: offset + 1 };
    }
    if (head >= 0xe0) {
      return { value: head - 0x100, next: offset + 1 };
    }
    if ((head & 0xe0) === 0xa0) {
      return parseString(head & 0x1f, 1);
    }
    if ((head & 0xf0) === 0x90) {
      return parseArray(head & 0x0f, 1);
    }
    if ((head & 0xf0) === 0x80) {
      return parseMap(head & 0x0f, 1);
    }

    switch (head) {
    case 0xc0:
      return { value: null, next: offset + 1 };
    case 0xc2:
      return { value: false, next: offset + 1 };
    case 0xc3:
      return { value: true, next: offset + 1 };
    case 0xcc:
      if (!needs(2)) {
        return null;
      }
      return { value: bytes[offset + 1], next: offset + 2 };
    case 0xcd:
      if (!needs(3)) {
        return null;
      }
      return { value: (bytes[offset + 1] << 8) | bytes[offset + 2], next: offset + 3 };
    case 0xce:
      if (!needs(5)) {
        return null;
      }
      return {
        value: ((bytes[offset + 1] << 24) >>> 0)
          + (bytes[offset + 2] << 16)
          + (bytes[offset + 3] << 8)
          + bytes[offset + 4],
        next: offset + 5,
      };
    case 0xd0:
      if (!needs(2)) {
        return null;
      }
      return { value: (bytes[offset + 1] << 24) >> 24, next: offset + 2 };
    case 0xd1:
      if (!needs(3)) {
        return null;
      }
      return {
        value: (bytes[offset + 1] << 24 >> 16) | bytes[offset + 2],
        next: offset + 3,
      };
    case 0xd2:
      if (!needs(5)) {
        return null;
      }
      return {
        value: (bytes[offset + 1] << 24)
          | (bytes[offset + 2] << 16)
          | (bytes[offset + 3] << 8)
          | bytes[offset + 4],
        next: offset + 5,
      };
    case 0xd9:
      if (!needs(2)) {
        return null;
      }
      return parseString(bytes[offset + 1], 2);
    case 0xda:
      if (!needs(3)) {
        return null;
      }
      return parseString((bytes[offset + 1] << 8) | bytes[offset + 2], 3);
    case 0xc4: {
      if (!needs(2)) {
        return null;
      }
      const len = bytes[offset + 1];
      if (!needs(2 + len)) {
        return null;
      }
      const start = offset + 2;
      const end = start + len;
      return { value: bytes.slice(start, end), next: end };
    }
    case 0xc5: {
      if (!needs(3)) {
        return null;
      }
      const len = (bytes[offset + 1] << 8) | bytes[offset + 2];
      if (!needs(3 + len)) {
        return null;
      }
      const start = offset + 3;
      const end = start + len;
      return { value: bytes.slice(start, end), next: end };
    }
    case 0xdc:
      if (!needs(3)) {
        return null;
      }
      return parseArray((bytes[offset + 1] << 8) | bytes[offset + 2], 3);
    case 0xde:
      if (!needs(3)) {
        return null;
      }
      return parseMap((bytes[offset + 1] << 8) | bytes[offset + 2], 3);
    case 0xcb: {
      if (!needs(9)) {
        return null;
      }
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 8);
      return { value: view.getFloat64(0), next: offset + 9 };
    }
    default:
      throw new Error('Unsupported msgpack tag: 0x' + head.toString(16));
    }
  }

  class DecoderStream {
    constructor(onValue) {
      this.onValue = onValue;
      this.buffer = new Uint8Array(0);
      this.length = 0;
    }

    feedByte(byte) {
      const next = new Uint8Array(this.length + 1);
      next.set(this.buffer.subarray(0, this.length), 0);
      next[this.length] = byte & 0xff;
      this.buffer = next;
      this.length += 1;
      this.flush();
    }

    flush() {
      let offset = 0;
      while (offset < this.length) {
        const decoded = decodeAt(this.buffer, offset, this.length);
        if (!decoded) {
          break;
        }
        offset = decoded.next;
        this.onValue(decoded.value);
      }
      if (offset > 0) {
        this.buffer = this.buffer.slice(offset, this.length);
        this.length -= offset;
      }
    }
  }

  global.NvimMsgpack = {
    encode: encode,
    DecoderStream: DecoderStream,
  };
})(typeof self === 'undefined' ? globalThis : self);
