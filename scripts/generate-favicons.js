// scripts/generate-favicons.js
const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

function crc32(buf) {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([lenBuf, t, data, crcBuf])
}

function makeSolidPng(w, h, r, g, b) {
  const sig  = Buffer.from('89504e470d0a1a0a', 'hex')
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2  // 8-bit RGB
  const rows = []
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3)
    for (let x = 0; x < w; x++) { row[1+x*3]=r; row[2+x*3]=g; row[3+x*3]=b }
    rows.push(row)
  }
  const idat = zlib.deflateSync(Buffer.concat(rows))
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))])
}

// Root orange #CC5500 = rgb(204, 85, 0)
const [r, g, b] = [204, 85, 0]
const out = 'public/brand'
for (const [size, name] of [[16,'favicon-16'],[32,'favicon-32'],[180,'favicon-180'],[512,'favicon-512']]) {
  fs.writeFileSync(path.join(out, `${name}.png`), makeSolidPng(size, size, r, g, b))
  console.log(`Created ${name}.png (${size}×${size})`)
}
