// Headless smoke test for DEAD BEFORE DAWN.
// Runs the real game script against a stubbed canvas and plays a full chapter:
// find the hatch -> bunker -> switch -> escape, plus shop, accounts and combat.
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(process.argv[2], 'utf8');
const m = /<script>([\s\S]*)<\/script>/.exec(html);
if (!m) { console.error('no script'); process.exit(1); }

let now = 0;
const raf = [];

function makeCtx() {
  const grad = { addColorStop() {} };
  const base = {
    canvas: null,
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 10 })
  };
  return new Proxy(base, {
    get(t, p) { if (p in t) return t[p]; if (p === 'then') return undefined; return () => {}; },
    set(t, p, v) { t[p] = v; return true; }
  });
}

const canvas = {
  width: 1280, height: 720, style: {},
  addEventListener(type, fn) { add(type, fn); },
  getContext() { const c = makeCtx(); c.canvas = canvas; return c; }
};

const listeners = {};
function add(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }

const sandbox = {
  console, Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean, Error, Infinity, isFinite,
  parseInt, parseFloat, performance: { now: () => now },
  requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
  location: { hash: '' }
};
const store = new Map();
sandbox.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = {
  getElementById: () => canvas,
  addEventListener: add,
  exitPointerLock() {},
  hidden: false,
  pointerLockElement: null
};
sandbox.window.innerWidth = 1280;
sandbox.window.innerHeight = 720;
sandbox.window.devicePixelRatio = 1;
sandbox.window.addEventListener = add;
sandbox.addEventListener = add;

vm.createContext(sandbox);

let fails = 0;
const log = [];
function check(cond, msg) {
  if (!cond) { fails++; log.push('  ✗ ' + msg); }
  else log.push('  ✓ ' + msg);
}

function frames(n) {
  for (let i = 0; i < n; i++) {
    now += 16.67;
    const q = raf.splice(0, raf.length);
    for (const fn of q) fn(now);
  }
}

try {
  vm.runInContext(m[1], sandbox, { filename: 'dead-before-dawn.js' });
  log.push('✓ script loaded');
  frames(3);

  const g = sandbox.window.__fps;
  check(!!g, 'debug hook exists');
  check(g.state === 'login', 'boots to the login screen (state=' + g.state + ')');

  // ---------- ACCOUNTS ----------
  check(g.login('tester', 'hunter2') === true, 'can create an account with a passcode');
  check(g.state === 'menu', 'signing in opens the menu');
  check(g.user === 'TESTER', 'names are normalised to upper case');
  check(g.cash === 0, 'a new account starts broke');
  frames(20);
  check(g.state === 'menu', 'menu is stable');

  // ---------- PASSCODE ----------
  g.logout();
  frames(2);
  check(g.state === 'login', 'logout returns to login');
  check(g.login('tester', 'wrongpass') === false, 'a wrong passcode is rejected');
  check(g.loginError.length > 0, 'an error message is shown');
  check(g.user === null, 'a failed sign-in does not log you in');
  check(g.login('tester', 'hunter2') === true, 'the correct passcode signs in');
  check(g.user === 'TESTER', 'you are logged in again');

  // ---------- CHAPTER FLOW ----------
  check(g.progress === 0, 'only chapter 1 is unlocked at first');
  g.start(0);
  frames(3);
  check(g.state === 'play', 'chapter starts');
  check(g.phase === 'find', 'phase 1 is FIND THE BUNKER');
  check(g.indoor === false, 'phase 1 is outdoors');
  check(g.phaseQuota > 0, 'the chapter demands kills (' + g.phaseQuota + ')');
  check(!!g.hatch, 'a bunker hatch exists somewhere in the level');

  const hatch = g.hatch;
  check(Math.hypot(hatch.x - g.player.x, hatch.y - g.player.y) > 6, 'the hatch is hidden away from the spawn');

  // the hatch must stay shut until the quota is met
  g.teleport(hatch.x, hatch.y);
  frames(4);
  check(g.phase === 'find', 'the hatch will not open while zombies are still up');

  function clearQuota(maxIter) {
    let guard = 0;
    while (g.phaseKills < g.phaseQuota && guard++ < (maxIter || 600)) {
      g.heal();
      if (!g.killAny()) frames(40);
      else frames(2);
    }
    return g.phaseKills >= g.phaseQuota;
  }

  // step away from the hatch so finishing the quota doesn't auto-descend mid-fight
  g.teleport(hatch.x + 10, hatch.y);
  frames(2);
  check(clearQuota(), 'killing enough zombies fills the quota (' + g.phaseKills + '/' + g.phaseQuota + ')');

  g.teleport(hatch.x, hatch.y);
  frames(4);
  check(g.phase === 'switch', 'with the area clear, the hatch opens (phase=' + g.phase + ')');
  check(g.indoor === true, 'the bunker is underground (no sky)');
  check(!!g.specials.key, 'the bunker contains a power switch');
  check(g.phaseQuota > 0, 'the bunker has its own kill quota (' + g.phaseQuota + ')');

  // the switch is locked until the bunker is cleared
  const key = g.specials.key;
  g.teleport(key.x, key.y);
  frames(4);
  check(g.phase === 'switch', 'the switch stays locked until the bunker is cleared');

  g.teleport(key.x + 10, key.y);
  frames(2);
  check(clearQuota(), 'clearing the bunker fills the quota (' + g.phaseKills + '/' + g.phaseQuota + ')');

  g.teleport(key.x, key.y);
  frames(4);
  check(g.phase === 'escape', 'flipping the switch starts the escape (phase=' + g.phase + ')');
  check(g.aliveBots > 0, 'more zombies arrive for the escape');
  check(g.phaseKills === 0, 'the escape phase starts its own quota');

  // the exit is sealed during the escape quota
  const exit = g.specials.exit;
  g.teleport(exit.x, exit.y);
  frames(4);
  check(g.state === 'play', 'the exit is sealed until the last quota is met');

  g.teleport(exit.x + 10, exit.y);
  frames(2);
  check(clearQuota(), 'clearing the escape quota opens the exit');

  g.teleport(exit.x, exit.y);
  frames(4);
  check(g.state === 'won', 'reaching the exit clears the chapter (state=' + g.state + ')');
  check(g.progress >= 1, 'chapter 2 is now unlocked');
  check(g.cash > 0, 'clearing a chapter pays out ($' + g.cash + ')');

  // next chapter is playable
  g.start(1);
  frames(3);
  check(g.state === 'play' && g.chapter === 1, 'chapter 2 can be started');

  // ---------- MOVEMENT / CAMERA ----------
  g.start(0);
  frames(3);
  const p0 = g.player;
  g.press('KeyW');
  frames(20);
  g.release('KeyW');
  const p1 = g.player;
  check(Math.hypot(p1.x - p0.x, p1.y - p0.y) > 0.2, 'WASD moves the player');

  g.press('Space');
  frames(4);
  check(g.player.z > 0.05, 'jump lifts the camera');
  frames(40);
  check(g.player.z < 0.05, 'gravity brings you back down');

  const camBefore = g.player.camZ;
  g.press('KeyW');
  g.press('ShiftLeft');
  frames(8);
  check(g.player.camZ < camBefore - 0.02, 'sliding lowers the camera');
  g.release('ShiftLeft'); g.release('KeyW');
  frames(30);

  const dragAng = g.player.ang;
  for (const fn of (listeners.mousemove || [])) fn({ movementX: 150, movementY: 0, buttons: 2 });
  check(g.player.ang !== dragAng, 'right-drag turns the view without pointer lock');

  const keyAng = g.player.ang;
  g.down('ArrowRight');
  frames(20);
  g.release('ArrowRight');
  check(g.player.ang !== keyAng, 'arrow keys turn the view');

  sandbox.document.pointerLockElement = canvas;
  for (const fn of (listeners.pointerlockchange || [])) fn();
  const lockAng = g.player.ang;
  for (const fn of (listeners.mousemove || [])) fn({ movementX: 120, movementY: 0, buttons: 0 });
  check(g.player.ang !== lockAng, 'mouse turns the view while pointer is locked');
  sandbox.document.pointerLockElement = null;
  for (const fn of (listeners.pointerlockchange || [])) fn();
  check(g.state === 'paused', 'losing pointer lock pauses');
  g.press('Escape');
  frames(2);

  // ---------- AIM DOWN SIGHTS ----------
  g.start(0);
  frames(3);
  const hipFov = g.fov;
  for (const fn of (listeners.mousedown || [])) fn({ clientX: 640, clientY: 360, button: 2 });
  frames(25);
  check(g.ads > 0.5, 'right-click aims down sights');
  check(g.fov < hipFov - 0.05, 'aiming zooms in');
  for (const fn of (listeners.mouseup || [])) fn({ button: 2 });
  frames(30);
  check(g.ads < 0.2, 'releasing returns to hip fire');

  const sens0 = g.sens;
  g.press('BracketRight');
  frames(2);
  check(g.sens > sens0, '] raises sensitivity');
  g.press('BracketLeft');
  frames(2);
  check(Math.abs(g.sens - sens0) < 0.01, '[ lowers it back');

  // ---------- WEAPONS ----------
  g.start(0);
  frames(3);
  g.setSlot('main');
  frames(15);
  const list = g.botList;
  const target = list.find(b => b.alive);
  check(!!target, 'a zombie exists to shoot');
  if (target) {
    const idx = list.indexOf(target);
    g.setSlot('main');
    frames(15);
    // try a few offsets — the zombie might be hugging a wall
    let hit = false;
    for (let attempt = 0; attempt < 8 && !hit; attempt++) {
      const t = g.botList[idx];
      if (!t || !t.alive) { hit = true; break; }
      const a = attempt * 0.9;
      g.teleport(t.x + Math.cos(a) * 0.45, t.y + Math.sin(a) * 0.45);
      g.aim(Math.atan2(t.y - g.player.y, t.x - g.player.x));
      g.fire(true); frames(10); g.fire(false); frames(2);
      const after = g.botList[idx];
      if (!after || !after.alive || after.hp < t.hp) hit = true;
    }
    check(hit, 'bullets damage zombies');

    const t2 = g.botList[idx];
    if (t2 && t2.alive) {
      g.setSlot('knife');
      frames(30);
      const t2b = g.botList[idx];
      g.teleport(t2b.x - 2.4, t2b.y);
      g.aim(Math.atan2(t2b.y - g.player.y, t2b.x - g.player.x));
      g.fire(true); frames(6); g.fire(false); frames(2);
      const after2 = g.botList[idx];
      check(after2 && (after2.hp < t2b.hp || !after2.alive), 'the knife works up close');
    }
  }

  // ---------- ZOMBIES BITE ----------
  g.start(0);
  frames(3);
  const zb = g.botList.filter(b => b.alive)[0];
  if (zb) {
    g.heal();
    const hpNear = g.hp;
    g.teleport(zb.x + 1.0, zb.y);
    frames(200);
    check(g.hp < hpNear || g.state === 'lost', 'zombies bite you up close');
  }

  // ---------- DOORS ----------
  const housesIdx = g.mapIds.indexOf('suburb');
  g.startFree('normal', housesIdx);
  frames(3);
  check(g.doors.length >= 12, 'the houses map has doors (' + g.doors.length + ')');

  const d0 = g.doors[0];
  check(g.probeSolid(d0.x, d0.y) === true, 'a closed door blocks the way');

  // automatic doors: walk up and they open, walk away and they shut
  g.teleport(d0.x + 0.5, d0.y + 1.6);
  frames(60);
  check(g.doors[0].open > 0.8, 'the door opens as you walk up to it (open=' + g.doors[0].open.toFixed(2) + ')');
  check(g.probeSolid(d0.x, d0.y) === false, 'an open door lets you through');

  g.teleport(d0.x + 0.5, d0.y + 9);
  frames(90);
  check(g.doors[0].open < 0.2, 'the door shuts behind you');

  // doors open for zombies too
  const zIdx = g.botList.findIndex(b => b.alive);
  check(zIdx >= 0, 'a zombie is available for the door test');
  if (zIdx >= 0) {
    g.teleport(d0.x + 0.5, d0.y + 16);      // player far away
    g.putBotAt(zIdx, d0.x + 0.5, d0.y + 1.4);
    frames(60);
    check(g.doors[0].open > 0.8, 'a zombie at the door opens it too');

    g.putBotAt(zIdx, d0.x + 0.5, d0.y + 16);
    frames(90);
    check(g.doors[0].open < 0.2, 'it shuts once the zombie has gone');
  }

  // ---------- CLASSES ----------
  const arenaIdx = g.mapIds.indexOf('arena');
  g.setClass(3);                       // TANK
  g.startFree('normal', arenaIdx);
  frames(2);
  check(g.maxHp === 150, 'TANK starts with 150 HP (got ' + g.maxHp + ')');
  g.setClass(2);                       // SCOUT
  g.startFree('normal', arenaIdx);
  frames(2);
  check(g.maxHp === 80, 'SCOUT starts with 80 HP (got ' + g.maxHp + ')');
  g.setClass(1);                       // MEDIC
  g.startFree('normal', arenaIdx);
  frames(2);
  check(g.maxHp === 100, 'MEDIC starts with 100 HP');
  g.hurt(40);
  const hurtHp = g.hp;
  g.killAny();
  frames(2);
  check(g.hp > hurtHp, 'MEDIC heals on a kill (' + hurtHp + '→' + g.hp + ')');
  g.setClass(0);

  // ---------- WALL HEIGHTS / COLOUR ----------
  g.startFree('normal', housesIdx);
  frames(2);
  check(g.wallHeight > 1.5, 'the houses map has tall walls (' + g.wallHeight + ')');
  g.startFree('normal', arenaIdx);
  frames(2);
  check(g.wallHeight === 1, 'the arena has normal walls');

  // ---------- MENU: four modes + armory ----------
  function clickAt(x, y) {
    for (const fn of (listeners.mousedown || [])) fn({ clientX: x, clientY: y, button: 0 });
    frames(2);
  }
  function clickRect(r) { clickAt(r.x + r.w / 2, r.y + r.h / 2); }
  function clickMode(i) { clickRect(g.ui.modes[i]); }
  function clickMap(i) { clickRect(g.ui.maps[i]); }
  function clickDeploy() { clickRect(g.ui.deploy); }

  // back to the menu
  g.press('Escape');
  g.press('KeyQ');
  frames(2);

  clickMode(1);
  check(g.menuMode === 1, 'clicking NORMAL selects the mode');
  check(g.state === 'menu', 'selecting a mode does not start a match');
  clickMap(2);
  check(g.menuMap === 2, 'clicking a map selects it');
  clickDeploy();
  check(g.state === 'vote', 'deploy opens the map vote (state=' + g.state + ')');
  check(g.vote.options.length === 4, 'four maps are nominated');
  g.castVote(0);
  check(g.vote.mine === 0 && g.vote.counts[0] >= 1, 'you can cast a vote');
  frames(30);
  check(g.state === 'vote', 'the vote keeps running while others vote');
  const nominees = g.vote.options.slice();
  g.finishVote();
  frames(4);
  check(g.state === 'play' && g.session === 'normal', 'the vote resolves into a match (' + g.session + ')');
  check(nominees.indexOf(g.mapIds.indexOf(g.map)) >= 0, 'the winning map is one of the nominees');
  check(g.phase === 'free', 'normal is free play, not a chapter (phase=' + g.phase + ')');

  // first to five
  let guard = 0;
  while (g.score.you < 5 && guard++ < 300) {
    g.heal();
    if (!g.killAny()) frames(40); else frames(2);
  }
  check(g.state === 'won', 'NORMAL ends at 5 kills (state=' + g.state + ')');

  // endless
  g.startFree('endless', 1);
  frames(3);
  check(g.session === 'endless' && g.state === 'play', 'ENDLESS starts');
  g.hurt(999);
  frames(3);
  check(g.state === 'lost', 'ENDLESS ends when you die');

  // randomized
  g.startFree('randomizer', 2);
  frames(3);
  const lo0 = g.loadout.join(',');
  let rerolled = false;
  for (let i = 0; i < 4 && !rerolled; i++) {
    const before2 = g.loadout.join(',');
    g.killAny();
    frames(2);
    if (g.loadout.join(',') !== before2) rerolled = true;
  }
  check(rerolled, 'RANDOMIZED re-rolls the loadout on a kill');

  // ---------- ARMORY: category tabs ----------
  g.openShop();
  frames(2);
  check(g.shopCategory === 'main', 'the armory opens on MAIN');
  check(g.shopCardIds.join(',') === 'rifle,smg,shotgun,dmr,lmg', 'MAIN lists only primaries');

  // click the KNIFE tab (4th)
  clickRect(g.ui.tabs[3]);
  check(g.shopCategory === 'knife', 'clicking KNIFE switches the category');
  check(g.shopCardIds.join(',') === 'knife,axe,machete,sledge', 'KNIFE lists only knives');

  g.setShopCategory('main');
  frames(2);

  // ---------- SHOP + ECONOMY ----------
  g.giveCash(3000);
  const before = g.cash;
  g.buy('smg');
  check(g.owned.smg === true, 'can buy a weapon');
  check(g.cash === before - 250, 'the price is deducted');
  check(g.equipped.main === 'smg', 'the bought weapon is equipped');
  check(g.buy('smg') === false, 'cannot buy the same weapon twice');
  g.closeShop();
  g.start(0);
  frames(3);
  check(g.loadout[0] === 'SMG', 'the equipped weapon is what you carry');

  // ---------- CONTENT ----------
  check(g.mapNames.length >= 8, 'eight maps are available (' + g.mapNames.length + ')');
  check(g.weaponCount === 16, 'sixteen weapons');
  check(g.zombieTypes.length === 8, 'eight zombie types (' + g.zombieTypes.length + ')');
  check(g.zombieTypes.indexOf('healer') >= 0, 'there is a zombie healer');
  check(g.zombieTypes.indexOf('necro') >= 0, 'there is a necromancer');

  // the necromancer keeps raising more
  g.startFree('normal', arenaIdx);
  frames(2);
  const troopsBefore = g.bots;
  g.spawnType('necro');
  for (let i = 0; i < 40; i++) { g.heal(); frames(15); }
  check(g.bots > troopsBefore, 'the necromancer raises the dead (' + troopsBefore + '→' + g.bots + ')');

  // the healer mends its neighbours
  g.startFree('normal', arenaIdx);
  frames(2);
  g.spawnType('healer');
  const ghostIdx = g.spawnType('shambler');
  g.hurtBot(ghostIdx, 60);
  const hpBeforeHeal = g.botList[ghostIdx].hp;
  for (let i = 0; i < 12; i++) { g.heal(); frames(15); }
  check(g.botList[ghostIdx].hp > hpBeforeHeal || !g.botList[ghostIdx].alive,
    'the healer mends nearby zombies (' + hpBeforeHeal + '→' + g.botList[ghostIdx].hp + ')');

  // ---------- ACCOUNT ISOLATION ----------
  const testersCash = g.cash;
  g.logout();
  frames(2);
  check(g.state === 'login', 'logout returns to login');
  g.login('second', 'pass2');
  check(g.cash === 0, 'a second account starts clean');
  g.giveCash(321);
  g.logout();
  check(g.login('TESTER', 'pass2') === false, 'passcodes are per account');
  g.login('TESTER', 'hunter2');
  check(g.cash === testersCash, 'the first account kept its cash');
  check(g.accountList.length === 2, 'both accounts are listed');
  check(g.progress >= 1, 'chapter progress is saved per account');

  // ---------- ANIMATION STATE ----------
  g.start(0);
  frames(2);
  g.setSlot('knife');
  frames(1);
  check(g.drawT > 0.5, 'switching weapons plays a raise animation (' + g.drawT.toFixed(2) + ')');
  frames(30);
  check(g.drawT < 0.2, 'the raise animation settles');

  g.setSlot('main');
  frames(10);
  const swayBefore = g.sway.x;
  for (const fn of (listeners.mousemove || [])) fn({ movementX: 260, movementY: 0, buttons: 2 });
  frames(2);
  check(Math.abs(g.sway.x - swayBefore) > 0.5, 'the weapon sways when you turn');

  // a wounded zombie flinches
  const flinchIdx = g.botList.findIndex(b => b.alive);
  if (flinchIdx >= 0) {
    g.hurtBot(flinchIdx, 5);
    frames(1);
    check(g.botList[flinchIdx].hitKick > 0.3, 'zombies flinch when hit');
  }

  // a killed zombie plays a death animation
  const dieIdx = g.botList.findIndex(b => b.alive);
  if (dieIdx >= 0) {
    g.killBotAt(dieIdx);
    frames(2);
    check(g.botList[dieIdx].deathT > 0.05, 'killed zombies start a death animation');
    frames(60);
    check(g.botList[dieIdx].deathT > 0.5, 'the death animation progresses');
  }

  // ---------- LAYOUT: nothing may overlap at any window size ----------
  function setSize(w, h) {
    sandbox.window.innerWidth = w;
    sandbox.window.innerHeight = h;
    for (const fn of (listeners.resize || [])) fn();
    frames(2);
  }
  function overlaps(a, b) {
    return a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
  }
  function inside(r, w, h) {
    return r.x >= -1 && r.y >= -1 && r.x + r.w <= w + 1 && r.y + r.h <= h + 1;
  }
  function firstOverlap(list, label) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (overlaps(list[i], list[j])) return label + ' #' + i + '/#' + j;
      }
    }
    return null;
  }

  const sizes = [[1920, 1080], [1366, 768], [1280, 720], [1024, 600], [800, 600]];
  const layoutProblems = [];

  for (const [w, h] of sizes) {
    setSize(w, h);
    g.logout(); g.login('TESTER', 'hunter2'); frames(2);
    let ui = g.ui;

    for (const r of ui.modes.concat(ui.chapters, ui.classes, [ui.shop, ui.deploy, ui.switchBtn])) {
      if (!inside(r, w, h)) layoutProblems.push('outside@' + w + 'x' + h);
    }
    for (const bad of [
      firstOverlap(ui.modes, 'modes@' + w),
      firstOverlap(ui.chapters, 'chapters@' + w),
      firstOverlap(ui.classes, 'classes@' + w),
      firstOverlap([ui.shop, ui.deploy], 'buttons@' + w),
      overlaps(ui.modes[0], ui.chapters[0]) ? 'modes/content@' + w : null,
      overlaps(ui.chapters[0], ui.classes[0]) ? 'content/classes@' + w : null,
      overlaps(ui.classes[0], ui.shop) ? 'classes/buttons@' + w : null
    ]) if (bad) layoutProblems.push(bad);

    // map grid view
    clickRect(ui.modes[1]);
    ui = g.ui;
    for (const bad of [
      firstOverlap(ui.maps, 'maps@' + w),
      overlaps(ui.modes[0], ui.maps[0]) ? 'modes/maps@' + w : null,
      overlaps(ui.maps[ui.maps.length - 1], ui.classes[0]) ? 'maps/classes@' + w : null
    ]) if (bad) layoutProblems.push(bad);
    for (const r of ui.maps) if (!inside(r, w, h)) layoutProblems.push('map outside@' + w);

    // map vote screen
    clickRect(ui.deploy);
    ui = g.ui;
    if (ui.cards) {
      if (firstOverlap(ui.cards, 'vote cards@' + w)) layoutProblems.push('vote overlap@' + w);
      for (const r of ui.cards) if (!inside(r, w, h)) layoutProblems.push('vote outside@' + w);
    }
    g.press('Escape');
    frames(2);

    // login
    g.logout(); frames(2);
    ui = g.ui;
    if (overlaps(ui.nameField, ui.passField)) layoutProblems.push('login fields@' + w);
    if (ui.cards.length && overlaps(ui.cards[ui.cards.length - 1], ui.nameField)) layoutProblems.push('login cards/fields@' + w);
    for (const r of [ui.nameField, ui.passField].concat(ui.cards)) {
      if (!inside(r, w, h)) layoutProblems.push('login outside@' + w);
    }

    // shop
    g.login('TESTER', 'hunter2'); frames(2);
    g.openShop(); frames(2);
    ui = g.ui;
    for (const bad of [
      overlaps(ui.tabs[0], ui.cards[0]) ? 'shop tabs/cards@' + w : null,
      firstOverlap(ui.cards, 'shop cards@' + w)
    ]) if (bad) layoutProblems.push(bad);
    for (const r of ui.tabs.concat(ui.cards, [ui.back])) if (!inside(r, w, h)) layoutProblems.push('shop outside@' + w);
    g.closeShop();
    frames(2);
  }

  check(layoutProblems.length === 0,
    'no overlapping UI at ' + sizes.length + ' window sizes' +
    (layoutProblems.length ? ' — ' + layoutProblems.slice(0, 5).join('; ') : ''));

  setSize(1280, 720);
  g.logout(); g.login('TESTER', 'hunter2');
  frames(2);

  // ---------- STRESS ----------
  g.start(0);
  frames(2);
  for (let i = 0; i < 250; i++) {
    g.press(['KeyW', 'KeyA', 'KeyS', 'KeyD'][i % 4]);
    if (i % 9 === 0) g.press('Space');
    if (i % 13 === 0) g.press('ShiftLeft');
    g.aim(i * 0.21);
    g.fire(i % 3 !== 0);
    frames(2);
  }
  g.fire(false);
  check(true, 'long random-input run did not throw');

} catch (e) {
  fails++;
  console.log('✗ THREW: ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e));
}

console.log(log.join('\n'));
console.log(fails === 0 ? '\nSMOKE TEST OK' : `\n${fails} FEJL`);
process.exit(fails === 0 ? 0 : 1);
