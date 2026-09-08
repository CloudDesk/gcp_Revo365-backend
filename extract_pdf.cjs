const zlib = require('zlib');
const fs = require('fs');
const buf = fs.readFileSync('C:\\Users\\Admin\\Documents\\GitHub\\Teqit\\TEQIT RENTAL AGREEMENT.pdf', 'binary');

// Decompress all FlateDecode streams
const streams = [];
let searchPos = 0;

while (true) {
  const idx = buf.indexOf('FlateDecode', searchPos);
  if (idx === -1) break;
  
  // Find stream start
  let sStart = -1;
  const s1 = buf.indexOf('stream\r\n', idx);
  const s2 = buf.indexOf('stream\n', idx);
  if (s1 !== -1 && (s2 === -1 || s1 < s2)) sStart = s1 + 8;
  else if (s2 !== -1) sStart = s2 + 7;
  
  if (sStart === -1) { searchPos = idx + 1; continue; }
  
  const sEnd = buf.indexOf('endstream', sStart);
  if (sEnd === -1 || sEnd - sStart > 5000000) { searchPos = idx + 1; continue; }
  
  try {
    const compressed = Buffer.from(buf.slice(sStart, sEnd), 'binary');
    const decompressed = zlib.inflateSync(compressed).toString('utf8');
    streams.push(decompressed);
  } catch(e) {}
  
  searchPos = idx + 11;
}

// Parse TJ and Tj operators to extract text
function extractTextFromPdfStream(stream) {
  const lines = [];
  // Match TJ arrays like [(text)-7(more)8(text)] TJ
  const tjRegex = /\[([^\]]+)\]\s*TJ/g;
  let match;
  while ((match = tjRegex.exec(stream)) !== null) {
    const inner = match[1];
    // Extract strings from parentheses
    const strRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
    let strMatch;
    let line = '';
    while ((strMatch = strRegex.exec(inner)) !== null) {
      line += strMatch[1].replace(/\\r/g, '').replace(/\\n/g, '');
    }
    if (line.trim()) lines.push(line.trim());
  }
  
  // Also match simple Tj operators: (text) Tj
  const tjSimpleRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g;
  while ((match = tjSimpleRegex.exec(stream)) !== null) {
    const text = match[1].replace(/\\r/g, '').replace(/\\n/g, '');
    if (text.trim()) lines.push(text.trim());
  }
  
  return lines;
}

const allText = [];
for (const stream of streams) {
  if (!stream.includes('BT') && !stream.includes('Tj')) continue;
  const lines = extractTextFromPdfStream(stream);
  if (lines.length > 0) {
    allText.push(...lines);
  }
}

const result = allText.join('\n');
fs.writeFileSync('C:\\Users\\Admin\\.gemini\\antigravity\\brain\\d4a9e7ca-5d47-494b-8c46-2bfaf8708bcd\\pdf_text.txt', result, 'utf8');
console.log('Total streams:', streams.length);
console.log('Total text lines:', allText.length);
console.log(result);
