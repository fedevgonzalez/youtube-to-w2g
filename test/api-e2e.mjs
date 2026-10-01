/**
 * Opt-in e2e for js/background.js (queue, sendItems, context menu, commands,
 * recent rooms). Loads the real service worker in a node:vm with a mocked
 * `chrome`.
 *
 *   node test/api-e2e.mjs                 OFFLINE: fake fetch, no network
 *   W2G_KEY=xxxx node test/api-e2e.mjs    ONLINE: real api.w2g.tv for the happy
 *                                         paths. This CREATES REAL TEMPORARY
 *                                         ROOMS on the account behind the key.
 *                                         Failure scenarios (500, bad key)
 *                                         always use the fake fetch. The key is
 *                                         never printed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ONLINE = !!process.env.W2G_KEY;
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const eq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const sleep = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setImmediate(r));

// Fake timers for the vm (badge flash); fired manually with fireTimers()
let timers = [];
const fakeSetTimeout = (fn) => { timers.push(fn); return timers.length; };
const fakeClearTimeout = (id) => { if (id) timers[id - 1] = null; };
const fireTimers = async () => { const t = timers; timers = []; t.forEach((fn) => fn && fn()); await sleep(); };

// ---- fake fetch -----------------------------------------------------------
const calls = []; // {url, body}
const fake = { create: 200, sync: 200, syncSeq: [] }; // HTTP status the fake returns (syncSeq: one-shot statuses)
let gate = null; // when set, fetch waits on it (lets a test act while a send is in flight)
let forceFake = !ONLINE;
const realFetch = globalThis.fetch;
const fakeFetch = async (url, opts) => {
  const isCreate = url.endsWith('/rooms/create.json');
  const status = isCreate ? fake.create : (fake.syncSeq.length ? fake.syncSeq.shift() : fake.sync);
  if (status !== 200) return new Response('fake error', { status });
  return isCreate
    ? new Response(JSON.stringify({ streamkey: 'fakekey' }), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response('', { status: 200 });
};
const fetchMock = async (url, opts) => {
  calls.push({ url, body: JSON.parse(opts.body) });
  if (gate) await gate;
  return forceFake ? fakeFetch(url, opts) : realFetch(url, opts);
};

// ---- chrome mock ----------------------------------------------------------
const listeners = { storage: [], message: null, command: null, menuClick: null, installed: null };
function area(name) {
  const data = {};
  return {
    data,
    get: async (k) => { await tick(); return Object.fromEntries([].concat(k).filter((x) => x in data).map((x) => [x, clone(data[x])])); },
    set: async (o) => {
      await tick();
      const ch = {};
      for (const k of Object.keys(o)) { ch[k] = { oldValue: clone(data[k]), newValue: clone(o[k]) }; data[k] = clone(o[k]); }
      // Like Chrome: onChanged is dispatched asynchronously, set() does not wait for it
      setImmediate(() => listeners.storage.forEach((f) => f(ch, name)));
    },
    remove: async (keys) => { for (const k of [].concat(keys)) delete data[k]; },
  };
}
const sync = area('sync');
const local = area('local');
const ev = { addListener() {} };
const badge = { text: null, color: null };
const menus = [];
const tabsOpened = [];
const notes = []; // messages sent to the YouTube tab
const ytTab = { id: 1, url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', title: 'Tab Title - YouTube' };
let activeTab = ytTab;

const chrome = {
  runtime: { onMessage: { addListener: (f) => (listeners.message = f) }, onInstalled: { addListener: (f) => (listeners.installed = f) }, lastError: null },
  storage: { sync, local, onChanged: { addListener: (f) => listeners.storage.push(f) } },
  tabs: {
    create: async (o) => { tabsOpened.push(o.url); },
    query: async (o) => {
      if (o.url && o.url.includes('youtube')) return [ytTab];
      if (o.active && o.currentWindow && !o.url) return [activeTab];
      return [];
    },
    sendMessage: async (id, m) => { notes.push(m); },
    onUpdated: ev, onRemoved: ev,
  },
  action: { openPopup() {}, setBadgeText: ({ text }) => (badge.text = text), setBadgeBackgroundColor: ({ color }) => (badge.color = color) },
  scripting: { executeScript: async () => {} },
  contextMenus: { removeAll: (cb) => { menus.length = 0; cb && cb(); }, create: (o) => menus.push(o), onClicked: { addListener: (f) => (listeners.menuClick = f) } },
  commands: { onCommand: { addListener: (f) => (listeners.command = f) } },
};

vm.runInNewContext(fs.readFileSync(path.join(root, 'js/background.js'), 'utf8'), {
  chrome, fetch: fetchMock, console: { log() {}, error() {}, warn() {} }, URL, setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout, navigator: {},
});

const send = (m) => new Promise((r) => listeners.message(m, { tab: { id: 1 } }, r));
const reset = async (cfg = {}) => {
  await sleep(); await fireTimers();
  for (const k of Object.keys(sync.data)) delete sync.data[k];
  await local.set({ queue: [] }); await sleep();
  Object.assign(sync.data, { apiKey: process.env.W2G_KEY || 'testkey123456', autoCopy: false, createNewRoom: false, roomKey: '' }, cfg);
  calls.length = tabsOpened.length = notes.length = 0;
  fake.create = fake.sync = 200; fake.syncSeq = []; gate = null;
  forceFake = !ONLINE;
};
const V = (id) => `https://www.youtube.com/watch?v=${id}`;

const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push([name, true]); } catch (e) { results.push([name, false, e]); }
};

// ---- scenarios ------------------------------------------------------------
await test('single send creates a room', async () => {
  await reset();
  const r = await send({ action: 'sendToW2G', videoUrl: V('aaaaaaaaaaa'), videoTitle: 't' });
  assert.equal(r.success, true); assert.equal(r.action, 'created_room'); assert.equal(r.count, 1);
  assert.equal(calls.length, 1); assert.ok(calls[0].url.endsWith('/rooms/create.json'));
  assert.equal(calls[0].body.share, V('aaaaaaaaaaa'));
  assert.ok(r.roomKey && sync.data.roomKey === r.roomKey);
  if (!ONLINE) assert.equal(r.roomKey, 'fakekey');
  eq(tabsOpened, [r.roomUrl]);
});

await test('single send into an existing room', async () => {
  await reset({ roomKey: 'fakekey' });
  if (ONLINE) sync.data.roomKey = (await send({ action: 'sendToW2G', videoUrl: V('aaaaaaaaaaa'), videoTitle: 't' })).roomKey;
  calls.length = 0;
  const r = await send({ action: 'sendToW2G', videoUrl: V('bbbbbbbbbbb'), videoTitle: 'b' });
  assert.equal(r.success, true); assert.equal(r.action, 'added_to_playlist'); assert.equal(r.count, 1);
  assert.equal(calls.length, 1); assert.ok(calls[0].url.endsWith('/playlists/current/playlist_items/sync_update'));
  eq(calls[0].body.add_items, [{ url: V('bbbbbbbbbbb'), title: 'b' }]);
});

await test('queueAdd: dedupe, shorts normalised, invalid rejected, badge', async () => {
  await reset();
  let r = await send({ action: 'queueAdd', videoUrl: V('aaaaaaaaaaa'), videoTitle: 'A' });
  eq(r, { success: true, count: 1, duplicate: false });
  r = await send({ action: 'queueAdd', videoUrl: 'https://youtu.be/aaaaaaaaaaa', videoTitle: 'A again' });
  eq(r, { success: true, count: 1, duplicate: true });
  r = await send({ action: 'queueAdd', videoUrl: 'https://www.youtube.com/shorts/bbbbbbbbbbb', videoTitle: 'S' });
  eq(r, { success: true, count: 2, duplicate: false });
  r = await send({ action: 'queueAdd', videoUrl: 'https://example.com/watch?v=ccccccccccc', videoTitle: 'x' });
  assert.equal(r.success, false); assert.ok(r.error);
  assert.equal(local.data.queue.length, 2);
  assert.equal(local.data.queue[1].url, V('bbbbbbbbbbb'));
  await sleep(); assert.equal(badge.text, '2');
  r = await send({ action: 'queueRemove', videoUrl: V('aaaaaaaaaaa') });
  eq(r, { success: true, count: 1 }); await sleep(); assert.equal(badge.text, '1');
  r = await send({ action: 'queueClear' });
  eq(r, { success: true, count: 0 }); await sleep(); assert.equal(badge.text, '');
});

await test('queue cap is 50', async () => {
  await reset();
  await local.set({ queue: Array.from({ length: 50 }, (_, i) => ({ url: V(String(i).padStart(11, 'x')), title: '', added: 0 })) });
  const r = await send({ action: 'queueAdd', videoUrl: V('zzzzzzzzzzz'), videoTitle: '' });
  assert.equal(r.success, false); assert.equal(local.data.queue.length, 50);
});

await test('queueSend with createNewRoom: 1 create + 1 sync_update, queue cleared, badge updated', async () => {
  await reset({ createNewRoom: true });
  for (const id of ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']) await send({ action: 'queueAdd', videoUrl: V(id), videoTitle: id });
  await sleep(); assert.equal(badge.text, '3');
  const r = await send({ action: 'queueSend' });
  assert.equal(r.success, true); assert.equal(r.count, 3);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.endsWith('/rooms/create.json')); assert.equal(calls[0].body.share, V('aaaaaaaaaaa'));
  assert.ok(calls[1].url.includes(`/rooms/${r.roomKey}/`));
  eq(calls[1].body.add_items.map((i) => i.url), [V('bbbbbbbbbbb'), V('ccccccccccc')]);
  await sleep(); eq(local.data.queue, []); assert.equal(badge.text, '');
});

await test('queueSend failing (500) keeps the queue', async () => {
  await reset({ roomKey: 'fakekey' });
  forceFake = true; fake.sync = 500;
  await send({ action: 'queueAdd', videoUrl: V('aaaaaaaaaaa'), videoTitle: 'A' });
  await send({ action: 'queueAdd', videoUrl: V('bbbbbbbbbbb'), videoTitle: 'B' });
  const r = await send({ action: 'queueSend' });
  assert.equal(r.success, false); assert.equal(local.data.queue.length, 2); await sleep(); assert.equal(badge.text, '2');
  eq(await send({ action: 'queueSend' }).then((x) => x.success), false);
  await send({ action: 'queueClear' });
  const empty = await send({ action: 'queueSend' });
  assert.equal(empty.success, false); assert.equal(calls.length, 2, 'empty queue must not call the API');
});

await test('bad key -> error and validity cached false', async () => {
  await reset({ apiKey: 'bad_key_000000' });
  forceFake = true; fake.create = 401;
  const r = await send({ action: 'sendToW2G', videoUrl: V('aaaaaaaaaaa'), videoTitle: 't' });
  assert.equal(r.success, false); assert.match(r.error, /Invalid API key/);
  assert.equal(sync.data.apiKeyValid, false);
  const v = await send({ action: 'checkApiKeyValid' });
  assert.equal(v.valid, false); assert.equal(calls.length, 1, 'checkApiKeyValid must not call the API');
});

await test('no apiKey -> same config error, no API call', async () => {
  await reset({ apiKey: '' });
  const r = await send({ action: 'sendToW2G', videoUrl: V('aaaaaaaaaaa'), videoTitle: 't' });
  assert.equal(r.success, false); assert.match(r.error, /configure your W2G API key/); assert.equal(calls.length, 0);
});

await test('403 on existing room falls back to a new room', async () => {
  await reset({ roomKey: 'oldroom' });
  forceFake = true; fake.sync = 403;
  const r = await send({ action: 'sendToW2G', videoUrl: V('aaaaaaaaaaa'), videoTitle: 't' });
  assert.equal(r.success, true); assert.equal(r.action, 'created_room');
  assert.ok(calls[0].url.includes('/rooms/oldroom/')); assert.ok(calls[1].url.endsWith('/rooms/create.json'));
});

await test('recentRooms: order, dedupe, cap 6, ignores empty', async () => {
  await reset();
  for (const k of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) { await sync.set({ roomKey: k }); await sleep(); }
  eq(sync.data.recentRooms, ['g', 'f', 'e', 'd', 'c', 'b']);
  await sync.set({ roomKey: 'd' }); await sleep();
  eq(sync.data.recentRooms, ['d', 'g', 'f', 'e', 'c', 'b']);
  await sync.set({ roomKey: '' }); await sleep();
  eq(sync.data.recentRooms, ['d', 'g', 'f', 'e', 'c', 'b']);
});

await test('context menus registered on install', async () => {
  listeners.installed();
  eq(menus.map((m) => m.id), ['send-link', 'send-page', 'queue-link', 'queue-page']);
  assert.ok(menus.every((m) => (m.targetUrlPatterns || m.documentUrlPatterns).includes('*://*.youtube.com/embed/*')));
  eq(menus.find((m) => m.id === 'send-link').contexts, ['link']);
  eq(menus.find((m) => m.id === 'queue-page').contexts, ['page', 'video']);
});

await test('context menu: link send / page queue / link with bad URL', async () => {
  await reset({ roomKey: 'fakekey' });
  forceFake = true; // handler wiring only; never hit the real API with a fake room
  listeners.menuClick({ menuItemId: 'send-link', linkUrl: 'https://youtu.be/ccccccccccc' }, ytTab);
  await sleep();
  assert.equal(calls.length, 1); eq(calls[0].body.add_items, [{ url: V('ccccccccccc'), title: '' }]);
  assert.equal(notes.at(-1).type, 'success');
  listeners.menuClick({ menuItemId: 'queue-page', pageUrl: ytTab.url }, ytTab);
  await sleep();
  eq(local.data.queue.map((i) => [i.url, i.title]), [[V('aaaaaaaaaaa'), 'Tab Title']]);
  assert.match(notes.at(-1).message, /Added to Y2W queue/);
  const before = calls.length;
  listeners.menuClick({ menuItemId: 'send-link', linkUrl: 'https://www.youtube.com/feed/trending' }, ytTab);
  await sleep();
  assert.equal(calls.length, before); assert.equal(notes.at(-1).message, 'Open a video first');
});

await test('commands: send, queue, non-video YouTube page, non-YouTube tab', async () => {
  await reset({ roomKey: 'fakekey' });
  forceFake = true; // handler wiring only; never hit the real API with a fake room
  await listeners.command('send-video', ytTab);
  assert.equal(calls.length, 1); eq(calls[0].body.add_items, [{ url: V('aaaaaaaaaaa'), title: 'Tab Title' }]);
  await listeners.command('queue-video', ytTab);
  assert.equal(local.data.queue.length, 1);
  activeTab = ytTab; // tab omitted -> active tab is used
  await listeners.command('queue-video', undefined);
  assert.equal(local.data.queue.length, 1, 'duplicate via active tab');
  const home = { id: 1, url: 'https://www.youtube.com/', title: 'YouTube' };
  const n = notes.length, c = calls.length;
  await listeners.command('send-video', home);
  assert.equal(calls.length, c); assert.equal(notes.length, n + 1); assert.equal(notes.at(-1).message, 'Open a video first');
  await listeners.command('send-video', { id: 2, url: 'https://example.com/', title: 'x' });
  assert.equal(calls.length, c); assert.equal(notes.length, n + 1, 'silent on non-YouTube');
});

await test('5 concurrent queueAdd -> all 5 kept, badge 5', async () => {
  await reset();
  const ids = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee'];
  const rs = await Promise.all(ids.map((id) => send({ action: 'queueAdd', videoUrl: V(id), videoTitle: id })));
  assert.ok(rs.every((r) => r.success && !r.duplicate));
  eq(local.data.queue.map((i) => i.url).sort(), ids.map(V));
  await sleep(); assert.equal(badge.text, '5');
});

await test('queueRemove concurrent with queueAdd: no loss, no resurrection', async () => {
  await reset();
  await send({ action: 'queueAdd', videoUrl: V('aaaaaaaaaaa'), videoTitle: 'A' });
  await Promise.all([
    send({ action: 'queueAdd', videoUrl: V('bbbbbbbbbbb'), videoTitle: 'B' }),
    send({ action: 'queueRemove', videoUrl: V('aaaaaaaaaaa') }),
    send({ action: 'queueAdd', videoUrl: V('ccccccccccc'), videoTitle: 'C' }),
  ]);
  eq(local.data.queue.map((i) => i.url), [V('bbbbbbbbbbb'), V('ccccccccccc')]);
});

const partial = async (createNewRoom) => {
  await reset({ createNewRoom: true });
  forceFake = true;
  for (const id of ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']) await send({ action: 'queueAdd', videoUrl: V(id), videoTitle: id });
  fake.sync = 500;
  let r = await send({ action: 'queueSend' });
  assert.equal(r.success, false); assert.equal(r.sent, 1);
  assert.equal(r.error, 'Room created with 1 of 3 videos; 2 remain queued');
  eq(local.data.queue.map((i) => i.url), [V('bbbbbbbbbbb'), V('ccccccccccc')]);
  assert.equal(sync.data.roomKey, 'fakekey');
  fake.sync = 200; calls.length = 0;
  sync.data.createNewRoom = createNewRoom;
};

await test('partial failure, retry with createNewRoom=false -> same room, 1 sync_update, no create', async () => {
  await partial(false);
  const r = await send({ action: 'queueSend' });
  assert.equal(r.success, true); assert.equal(calls.length, 1, 'no new create call');
  assert.ok(calls[0].url.includes('/rooms/fakekey/') && calls[0].url.endsWith('sync_update'));
  eq(calls[0].body.add_items.map((i) => i.url), [V('bbbbbbbbbbb'), V('ccccccccccc')]);
  await sleep(); eq(local.data.queue, []);
});

await test('partial failure, retry with createNewRoom=true -> new room for only the remaining items', async () => {
  await partial(true);
  const r = await send({ action: 'queueSend' });
  assert.equal(r.success, true); assert.equal(calls.length, 2);
  assert.ok(calls[0].url.endsWith('/rooms/create.json')); assert.equal(calls[0].body.share, V('bbbbbbbbbbb'));
  eq(calls[1].body.add_items.map((i) => i.url), [V('ccccccccccc')]);
  assert.ok(!JSON.stringify(calls).includes('aaaaaaaaaaa'), 'delivered item must not be resent');
  await sleep(); eq(local.data.queue, []);
});

await test('queueAdd + queueRemove during an in-flight queueSend: new item survives, delivered trimmed', async () => {
  await reset({ roomKey: 'fakekey' });
  forceFake = true;
  await send({ action: 'queueAdd', videoUrl: V('aaaaaaaaaaa'), videoTitle: 'A' });
  await send({ action: 'queueAdd', videoUrl: V('bbbbbbbbbbb'), videoTitle: 'B' });
  let release; gate = new Promise((r) => (release = r));
  const sending = send({ action: 'queueSend' });
  await sleep(); assert.equal(calls.length, 1, 'send is waiting on the gate');
  await send({ action: 'queueAdd', videoUrl: V('ccccccccccc'), videoTitle: 'C' });
  await send({ action: 'queueRemove', videoUrl: V('bbbbbbbbbbb') });
  gate = null; release();
  const r = await sending;
  assert.equal(r.success, true); assert.equal(r.sent, 2);
  eq(local.data.queue.map((i) => i.url), [V('ccccccccccc')]);
});

await test('403 on existing room does not wipe a roomKey the user switched to meanwhile', async () => {
  await reset({ roomKey: 'oldroom' });
  forceFake = true; fake.syncSeq = [403];
  let release; gate = new Promise((r) => (release = r));
  const sending = send({ action: 'sendToW2G', videoUrl: V('aaaaaaaaaaa'), videoTitle: 't' });
  await sleep();
  await sync.set({ roomKey: 'newroom' }); await sleep();
  gate = null; release();
  const r = await sending;
  assert.equal(sync.data.roomKey, 'newroom', 'newer roomKey must survive');
  assert.equal(r.success, true);
  assert.ok(calls.at(-1).url.includes('/rooms/newroom/'));
  assert.ok(calls.every((c) => !c.url.endsWith('/rooms/create.json')));
});

await test('two concurrent queueSend -> one set of API calls, other rejected', async () => {
  await reset({ roomKey: 'fakekey' });
  forceFake = true;
  await send({ action: 'queueAdd', videoUrl: V('aaaaaaaaaaa'), videoTitle: 'A' });
  const [r1, r2] = await Promise.all([send({ action: 'queueSend' }), send({ action: 'queueSend' })]);
  assert.equal(r1.success, true);
  eq(r2, { success: false, error: 'A send is already in progress' });
  assert.equal(calls.length, 1);
});

await test('badge flashes on menu/command success and failure, then restores count', async () => {
  await reset({ roomKey: 'fakekey' });
  forceFake = true;
  await send({ action: 'queueAdd', videoUrl: V('bbbbbbbbbbb'), videoTitle: 'B' });
  await sleep(); assert.equal(badge.text, '1');
  listeners.menuClick({ menuItemId: 'send-link', linkUrl: V('ccccccccccc') }, { id: 2, url: 'https://example.com/' });
  await sleep(); assert.equal(badge.text, '\u2713'); assert.equal(badge.color, '#4CAF50');
  await fireTimers(); assert.equal(badge.text, '1');
  fake.sync = 500;
  await listeners.command('send-video', ytTab);
  assert.equal(badge.text, '!'); assert.equal(badge.color, '#D93025');
  await fireTimers(); assert.equal(badge.text, '1');
  await listeners.command('queue-video', ytTab);
  assert.equal(badge.text, '\u2713');
  await sleep(); assert.equal(badge.text, '\u2713', 'count update must not clobber the flash');
  await fireTimers(); assert.equal(badge.text, '2');
});

// ---- report ---------------------------------------------------------------
let failed = 0;
for (const [name, ok, e] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { failed++; console.log('      ' + (e && e.message)); }
}
console.log(`\n${results.length - failed}/${results.length} passed (${ONLINE ? 'ONLINE' : 'offline'})`);
process.exit(failed ? 1 : 0);
