// Replaces the hand-written `rows: [...]` of selected maps with generated layouts.
const fs = require('fs');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');

function replaceRows(id, expr) {
  const idIdx = s.indexOf("id: '" + id + "'");
  if (idIdx < 0) throw new Error('map id not found: ' + id);
  const rowsIdx = s.indexOf('rows: [', idIdx);
  if (rowsIdx < 0) throw new Error('rows not found for ' + id);

  let i = rowsIdx + 'rows: '.length;   // at '['
  let depth = 0;
  let inStr = false;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === "'") inStr = false;
      continue;
    }
    if (ch === "'") { inStr = true; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error('unbalanced rows for ' + id);
  s = s.slice(0, rowsIdx) + 'rows: ' + expr + s.slice(i + 1);
  console.log('rewrote rows for', id, '->', expr);
}

replaceRows('suburb', 'genRooms()');
replaceRows('waste', 'genHall()');
replaceRows('bunker1', 'genCorridors()');
replaceRows('bunker3', 'genRings()');

fs.writeFileSync(p, s, 'utf8');
console.log('done');
