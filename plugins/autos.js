// plugins/autostatus-fixed.js
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { lite } = require('../lite');
const config = require('../settings');

const DATA_DIR = path.join(__dirname, '../my_data');
const LIST_PATH = path.join(DATA_DIR, 'autostatus_list.json');
const STATE_PATH = path.join(DATA_DIR, 'autostatus_state.json');

// <-- YOUR PROVIDED IMAGE LIST -->
const DEFAULT_LIST = [
  { url: "https://files.catbox.moe/nt7ivw.jpg", caption: "✨ Day 1 — Keep shining ✨" },
  { url: "https://files.catbox.moe/roulyk.jpg", caption: "🔥 Day 2 — Push harder, rise stronger 🔥" },
  { url: "https://files.catbox.moe/39pgqp.jpg", caption: "🌸 Day 3 — Happiness in small moments 🌸" },
  { url: "https://files.catbox.moe/intjrq.jpg", caption: "⚡ Day 4 — Focus brings power ⚡" },
  { url: "https://files.catbox.moe/oi1n6j.jpg", caption: "💎 Day 5 — Be your best version 💎" },
  { url: "https://files.catbox.moe/mjj886.jpg", caption: "🌍 Day 6 — Explore, Dream, Discover 🌍" },
  { url: "https://files.catbox.moe/xincxd.jpg", caption: "🚀 Day 7 — Big dreams, strong steps 🚀" }
];

let TIMER = null; // in-memory timer handle

// Helpers
async function ensureFiles() {
  if (!fs.existsSync(DATA_DIR)) await fsp.mkdir(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LIST_PATH)) await fsp.writeFile(LIST_PATH, JSON.stringify(DEFAULT_LIST, null, 2), 'utf8');
  if (!fs.existsSync(STATE_PATH)) {
    const init = { running: false, dayIndex: 0, intervalMs: 24 * 60 * 60 * 1000, nextSend: null, startedAt: null };
    await fsp.writeFile(STATE_PATH, JSON.stringify(init, null, 2), 'utf8');
  }
}

async function readList() {
  try {
    const raw = await fsp.readFile(LIST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULT_LIST.slice();
  }
}
async function writeList(list) {
  await fsp.writeFile(LIST_PATH, JSON.stringify(list, null, 2), 'utf8');
}
async function readState() {
  try {
    const raw = await fsp.readFile(STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { running: false, dayIndex: 0, intervalMs: 24 * 60 * 60 * 1000, nextSend: null, startedAt: null };
  }
}
async function writeState(st) {
  await fsp.writeFile(STATE_PATH, JSON.stringify(st, null, 2), 'utf8');
}

// send status (image+caption) to status@broadcast with newsletter context
async function sendStatus(conn, item, dayNumber, isFinal = false) {
  const caption = isFinal
    ? `✅ NENO XMD Auto Status Complete!\n\n© NENO XMD`
    : `${item.caption}\n\n> NENO XMD Auto Status • Day ${dayNumber}`;

  try {
    await conn.sendMessage("status@broadcast", {
      image: { url: item.url },
      caption,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363401225837204@newsletter',
          newsletterName: 'NENO XMD',
          serverMessageId: 143
        }
      }
    });
    console.log(`AutoStatus: sent day ${dayNumber}${isFinal ? ' (final)' : ''}`);
    return true;
  } catch (e) {
    console.error('AutoStatus send failed:', e);
    return false;
  }
}

// schedule next send using state
async function scheduleNext(conn) {
  // clear existing timer
  if (TIMER) { clearTimeout(TIMER); TIMER = null; }

  const state = await readState();
  if (!state.running) return;

  const now = Date.now();
  let ms = (typeof state.nextSend === 'number') ? state.nextSend - now : 0;
  if (ms < 0) ms = 0;

  // set timer
  TIMER = setTimeout(async () => {
    try {
      const lst = await readList();
      const st = await readState();
      if (!st.running) return;

      const idx = Math.min(st.dayIndex, lst.length - 1);
      const item = lst[idx];
      if (!item) {
        // nothing to send -> stop
        st.running = false;
        st.nextSend = null;
        await writeState(st);
        return;
      }

      // if this is last item (dayIndex === last index) then send item and final message
      const isLast = (st.dayIndex >= lst.length - 1);
      await sendStatus(conn, item, idx + 1, false);

      if (isLast) {
        // send final summary message and stop
        await sendStatus(conn, lst[lst.length - 1], lst.length, true).catch(()=>{});
        st.running = false;
        st.nextSend = null;
        st.startedAt = st.startedAt || Date.now();
        await writeState(st);
        console.log('AutoStatus: completed sequence.');
      } else {
        // advance and schedule next
        st.dayIndex = st.dayIndex + 1;
        st.nextSend = Date.now() + (st.intervalMs || 24 * 3600 * 1000);
        await writeState(st);
        // schedule again
        scheduleNext(conn);
      }
    } catch (e) {
      console.error('AutoStatus timer error:', e);
    }
  }, ms);
}

// COMMAND HANDLER
lite({
  pattern: "autostatus",
  react: "📤",
  desc: "Manage Auto Status: on/off/status/list/add/remove",
  category: "owner",
  filename: __filename
}, async (conn, mek, m, { from, args, reply, isOwner }) => {
  try {
    if (!isOwner) return reply("❌ Only owner can use this command.");
    await ensureFiles();

    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'help') {
      return reply(
`Usage:
.autostatus on [hours]   - Start auto status (default 24h interval)
.autostatus off          - Stop
.autostatus status       - Show state
.autostatus list         - Show items
.autostatus add <url>|<caption> - Add item
.autostatus remove <index> - Remove item`
      );
    }

    if (sub === 'on') {
      const hours = parseFloat(args[1]) || 24;
      const intervalMs = Math.max(0.1, hours) * 3600 * 1000; // min 0.1 hour
      const list = await readList();
      if (!Array.isArray(list) || list.length === 0) return reply("❌ Status list empty. Add items with `.autostatus add <url>|<caption>`");

      const st = await readState();
      if (st.running) return reply("⚠️ Auto Status already running.");

      st.running = true;
      st.dayIndex = 0;
      st.intervalMs = intervalMs;
      st.startedAt = Date.now();
      st.nextSend = Date.now(); // start immediately
      await writeState(st);

      // schedule
      await scheduleNext(conn);
      return reply(`✅ Auto Status started. Interval: ${hours} hour(s). First item will send shortly.`);
    }

    if (sub === 'off') {
      const st = await readState();
      if (!st.running) return reply("⚠️ Auto Status is not running.");
      st.running = false;
      st.nextSend = null;
      await writeState(st);
      if (TIMER) { clearTimeout(TIMER); TIMER = null; }
      return reply("✅ Auto Status stopped.");
    }

    if (sub === 'status') {
      const st = await readState();
      const list = await readList();
      return reply(
`🔎 Auto Status Info
Running: ${st.running ? 'Yes' : 'No'}
Started At: ${st.startedAt ? new Date(st.startedAt).toLocaleString() : 'N/A'}
Next Send: ${st.nextSend ? new Date(st.nextSend).toLocaleString() : 'N/A'}
Day Index: ${st.dayIndex || 0} / ${list.length}
Interval (hours): ${((st.intervalMs||0)/(3600*1000)).toFixed(2)}`
      );
    }

    if (sub === 'list') {
      const list = await readList();
      if (!list.length) return reply("List empty.");
      let out = '📜 Auto Status Items:\n\n';
      list.forEach((it, i) => out += `${i+1}. ${it.url}\n   ${it.caption}\n\n`);
      return reply(out);
    }

    if (sub === 'add') {
      const rest = args.slice(1).join(' ').trim();
      if (!rest || !rest.includes('|')) return reply("Usage: .autostatus add <imageUrl>|<caption>");
      const [url, ...cap] = rest.split('|');
      const caption = cap.join('|').trim();
      if (!url || !caption) return reply("Invalid format.");
      const list = await readList();
      list.push({ url: url.trim(), caption });
      await writeList(list);
      return reply(`✅ Added item #${list.length}`);
    }

    if (sub === 'remove') {
      const idx = parseInt(args[1]);
      if (!idx || idx < 1) return reply("Usage: .autostatus remove <index>");
      const list = await readList();
      if (idx > list.length) return reply("Index out of range.");
      const rem = list.splice(idx-1,1);
      await writeList(list);
      return reply(`✅ Removed item #${idx}`);
    }

    return reply("Unknown subcommand. Use .autostatus help");
  } catch (err) {
    console.error("autostatus command error:", err);
    reply("❌ Error in autostatus command. See console for details.");
  }
});
