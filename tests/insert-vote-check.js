// Inserts the map-vote layout check into the smoke test (UTF-8 safe).
const fs = require('fs');
const p = process.argv[2];
let s = fs.readFileSync(p, 'utf8');

const marker = "    // login\n    g.logout(); frames(2);";
if (!s.includes(marker)) {
  console.error('marker not found');
  process.exit(1);
}

const insert = [
  "    // map vote screen",
  "    clickRect(ui.deploy);",
  "    ui = g.ui;",
  "    if (ui.cards) {",
  "      if (firstOverlap(ui.cards, 'vote cards@' + w)) layoutProblems.push('vote overlap@' + w);",
  "      for (const r of ui.cards) if (!inside(r, w, h)) layoutProblems.push('vote outside@' + w);",
  "    }",
  "    g.press('Escape');",
  "    frames(2);",
  "",
  ""
].join('\n');

s = s.replace(marker, insert + marker);
fs.writeFileSync(p, s, 'utf8');
console.log('inserted vote layout check');
