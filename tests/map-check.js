// Validates every arena in DEAD BEFORE DAWN: equal row widths, sealed border,
// full connectivity, and enough open space to fight in.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');

// The layouts can be literal rows or generated, so evaluate the whole block
// from the generators through to the end of the MAPS array.
const start = html.indexOf('function genRooms');
const end = html.indexOf('let selectedMap');
if (start < 0 || end < 0) { console.error('map block not found'); process.exit(1); }

let MAPS;
try {
  const code = html.slice(start, end);
  MAPS = eval(code + '\n; MAPS');
} catch (e) {
  console.error('could not evaluate maps:', e.message);
  process.exit(1);
}
if (!Array.isArray(MAPS) || !MAPS.length) { console.error('MAPS did not evaluate to an array'); process.exit(1); }

let fails = 0;
function check(cond, msg) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) fails++;
}

console.log(`found ${MAPS.length} maps\n`);

MAPS.forEach((mp) => {
  const rows = mp.rows;
  const W = rows[0].length, H = rows.length;
  const widths = [...new Set(rows.map(r => r.length))];

  console.log(`${mp.name} (${mp.id}) ${W}x${H}`);

  check(widths.length === 1, 'all rows the same width' + (widths.length > 1 ? `: ${widths.join(',')}` : ''));

  let border = true;
  for (let x = 0; x < W; x++) if (rows[0][x] !== '#' || rows[H - 1][x] !== '#') border = false;
  for (let y = 0; y < H; y++) if (rows[y][0] !== '#' || rows[y][W - 1] !== '#') border = false;
  check(border, 'outer border sealed');

  let floorCount = 0, start = null;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (rows[y][x] !== '#') { floorCount++; if (!start) start = [x, y]; }
    }
  }
  check(floorCount > 100, `enough floor (${floorCount} tiles)`);

  if (start) {
    const seen = new Set([start[1] * W + start[0]]);
    const q = [start];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (rows[ny][nx] === '#') continue;
        const k = ny * W + nx;
        if (seen.has(k)) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    check(seen.size === floorCount, `fully connected (${seen.size}/${floorCount})`);
  }

  // open space: tiles with 3+ open neighbours (good for an arena)
  let open = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (rows[y][x] === '#') continue;
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (rows[y + dy][x + dx] !== '#') n++;
      if (n >= 3) open++;
    }
  }
  // tight corridor maps are intentional — judge them on a lower bar
  const openBar = mp.tight ? 0.10 : 0.45;
  check(open > floorCount * openBar,
    `open enough to fight in (${Math.round(open / floorCount * 100)}% open${mp.tight ? ', tight layout' : ''})`);
  console.log('');
});

console.log(fails === 0 ? 'MAPS OK' : `${fails} FEJL`);
process.exit(fails === 0 ? 0 : 1);
