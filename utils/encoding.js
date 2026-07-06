const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeUtf8(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) * 0x400) + (next - 0xdc00) + 0x10000;
        i += 1;
      }
    }

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6));
      bytes.push(0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    } else {
      bytes.push(0xf0 | (code >> 18));
      bytes.push(0x80 | ((code >> 12) & 0x3f));
      bytes.push(0x80 | ((code >> 6) & 0x3f));
      bytes.push(0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

function decodeUtf8(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const first = bytes[i];
    let code;

    if (first < 0x80) {
      code = first;
    } else if ((first & 0xe0) === 0xc0) {
      if (i + 1 >= bytes.length) return null;
      code = ((first & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      i += 1;
    } else if ((first & 0xf0) === 0xe0) {
      if (i + 2 >= bytes.length) return null;
      code = ((first & 0x0f) << 12) |
        ((bytes[i + 1] & 0x3f) << 6) |
        (bytes[i + 2] & 0x3f);
      i += 2;
    } else if ((first & 0xf8) === 0xf0) {
      if (i + 3 >= bytes.length) return null;
      code = ((first & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      i += 3;
    } else {
      return null;
    }

    if (code <= 0xffff) {
      result += String.fromCharCode(code);
    } else {
      code -= 0x10000;
      result += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    }
  }
  return result;
}

function base64UrlEncode(bytes) {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const first = bytes[i];
    const hasSecond = i + 1 < bytes.length;
    const hasThird = i + 2 < bytes.length;
    const second = hasSecond ? bytes[i + 1] : 0;
    const third = hasThird ? bytes[i + 2] : 0;

    output += BASE64_CHARS[first >> 2];
    output += BASE64_CHARS[((first & 0x03) << 4) | (second >> 4)];
    if (hasSecond) {
      output += BASE64_CHARS[((second & 0x0f) << 2) | (third >> 6)];
    }
    if (hasThird) {
      output += BASE64_CHARS[third & 0x3f];
    }
  }

  return output.replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(text) {
  if (typeof text !== 'string' || !text) return null;

  let buffer = 0;
  let bits = 0;
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] === '-' ? '+' : (text[i] === '_' ? '/' : text[i]);
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) return null;

    buffer = (buffer << 6) | value;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      buffer &= bits > 0 ? (1 << bits) - 1 : 0;
    }
  }

  return bytes;
}

function encodeJsonPayload(data) {
  return base64UrlEncode(encodeUtf8(JSON.stringify(data)));
}

function decodeJsonPayload(text) {
  const bytes = base64UrlDecode(text);
  if (!bytes) return null;

  const decoded = decodeUtf8(bytes);
  if (!decoded) return null;

  try {
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

module.exports = {
  encodeJsonPayload,
  decodeJsonPayload
};
