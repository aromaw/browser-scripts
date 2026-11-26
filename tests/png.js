'use strict';

const zlib = require('node:zlib');

function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (~c) >>> 0;
}

function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
}

function solidPng(width, height, r, g, b) {
    const stride = width * 3;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        const o = y * (stride + 1);
        raw[o] = 0;
        for (let x = 0; x < width; x++) {
            const p = o + 1 + x * 3;
            raw[p] = r;
            raw[p + 1] = g;
            raw[p + 2] = b;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    return Buffer.concat([
        sig,
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

function decodePng(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
    let o = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    const idat = [];
    while (o + 8 <= buf.length) {
        const len = buf.readUInt32BE(o);
        o += 4;
        const type = buf.toString('ascii', o, o + 4);
        o += 4;
        const data = buf.subarray(o, o + len);
        o += len + 4;
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
    }
    if (bitDepth !== 8 || interlace !== 0) {
        throw new Error('unsupported png ' + bitDepth + '/' + colorType + '/' + interlace);
    }
    const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
    if (!channels) throw new Error('unsupported color type ' + colorType);
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = Buffer.alloc(width * height * 4);
    let i = 0;
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[i++];
        const row = Buffer.alloc(stride);
        for (let x = 0; x < stride; x++) {
            const v = raw[i++];
            const left = x >= channels ? row[x - channels] : 0;
            const up = prev[x];
            const ul = x >= channels ? prev[x - channels] : 0;
            let recon = v;
            if (filter === 1) recon = (v + left) & 255;
            else if (filter === 2) recon = (v + up) & 255;
            else if (filter === 3) recon = (v + ((left + up) >> 1)) & 255;
            else if (filter === 4) recon = (v + paeth(left, up, ul)) & 255;
            else if (filter !== 0) throw new Error('bad filter ' + filter);
            row[x] = recon;
        }
        prev = row;
        for (let x = 0; x < width; x++) {
            const s = x * channels;
            const d = (y * width + x) * 4;
            if (channels === 1) {
                out[d] = out[d + 1] = out[d + 2] = row[s];
                out[d + 3] = 255;
            } else if (channels === 2) {
                out[d] = out[d + 1] = out[d + 2] = row[s];
                out[d + 3] = row[s + 1];
            } else if (channels === 3) {
                out[d] = row[s];
                out[d + 1] = row[s + 1];
                out[d + 2] = row[s + 2];
                out[d + 3] = 255;
            } else {
                out[d] = row[s];
                out[d + 1] = row[s + 1];
                out[d + 2] = row[s + 2];
                out[d + 3] = row[s + 3];
            }
        }
    }
    return {
        width,
        height,
        get(x, y) {
            const d = (y * width + x) * 4;
            return [out[d], out[d + 1], out[d + 2], out[d + 3]];
        },
    };
}

module.exports = { solidPng, decodePng };
