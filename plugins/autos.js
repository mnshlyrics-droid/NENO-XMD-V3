// plugins/autostatus-advanced.js
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { lite } = require('../lite');
const config = require('../settings');

const LIST_PATH = path.join(__dirname, '../my_data/autostatus_list.json');
const STATE_PATH = path.join(__dirname, '../my_data/autostatus_state.json');

// Default 7 images + final (replace URLs with your direct image links)
const DEFAULT_LIST = [
  { url: "https://files.catbox.moe/nt7ivw.jpg", caption: "✨ Day 1 — Keep shining ✨" },
  { url: "https://files.catbox.moe/roulyk.jpg", caption: "🔥 Day 2 — Push harder, rise stronger 🔥" },
  { url: "https://files.catbox.moe/39pgqp.jpg", caption: "🌸 Day 3 — Happiness in small moments 🌸" },
  { url: "https://files.catbox.moe/intjrq.jpg", caption: "⚡ Day 4 — Focus brings power ⚡" },
  { url: "https://files.catbox.moe/oi1n6j.jpg", caption: "💎 Day 5 — Be your best version 💎" },
  { url: "https://files.catbox.moe/mjj886.jpg", caption: "🌍 Day 6 — Explore, Dream, Discover 🌍" },
  { url: "https://files.catbox.moe/xincxd.jpg", caption: "🚀 Day 7 — Big dreams, strong steps 🚀" }
];

// Ensure my_data exists and files exist
async function ensureFiles() {
  const dir = path.join(__dirname, '../all');
  if (!fs.existsSync(dir)) await fsp.mkdir(dir, { recursive: true });

  if (!fs.existsSync(LIST_PATH)) {
    await fsp.writeFile(LIST_PATH, JSON.stringify(DEFAULT_LIST, null, 2), 'utf8');
  }
  if (!fs.existsSync(STATE_PATH)) {
    const initState = { running: false, dayIndex: 0, nextSend: null, intervalMs: 24*60*60*1000, startedAt: null };
    await fsp.writeFile(STATE_PATH, JSON.stringify(initState, null, 2), 'utf8');
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
    return { running: false, dayIndex: 0, nextSend: null, intervalMs: 24*60*60*1000, startedAt: null };
  }
}

async function writeState(state) {
  await fsp.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// send single status (image+caption) to status@broadcast
async function sendStatus(conn, item, dayNumber) {
  const caption = `${item.caption}\n\n> NENO XMD Auto Status • Day ${dayNumber}`;
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
    console.log(`AutoStatus: sent day ${dayNumber}`);
    return true;
  } catch (e) {
    console.error("AutoStatus send failed:", e);
    return false;
  }
}

// background checker runs every minute
let checkerHandle = null;
async function startChecker(conn) {
  if (checkerHandle) return;
  await ensureFiles();
  checkerHandle = setInterval(async () => {
    try {
      const state = await readState();
      if (!state.running) return;
      if (!state.nextSend) return;
      const now = Date.now();
      if (now >= state.nextSend) {
        const list = await readList();
        if (!Array.isArray(list) || list.length === 0) {
          console.warn("AutoStatus: empty list");
          // stop gracefully
          state.running = false;
          await writeState(state);
          return;
        }
        // dayIndex points to next item to send (0-based)
        const idx = Math.min(state.dayIndex, list.length - 1);
        const item = list[idx];
        const success = await sendStatus(conn, item, idx + 1);
        // advance
        state.dayIndex = state.dayIndex + 1;
        if (state.dayIndex >= list.length) {
          // send final "finished" status with NENO XMD Auto Status caption
          const finalCaption = `✅ NENO XMD Auto Status Complete!\n\n© NENO XMD`;
          try {
            await conn.sendMessage("status@broadcast", {
              image: { url: list[list.length - 1].url }, // reuse last image or change
              caption: finalCaption,
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
          } catch (e) { console.warn("AutoStatus final send failed", e); }
          // stop after complete
          state.running = false;
          state.nextSend = null;
          state.startedAt = state.startedAt || Date.now();
          await writeState(state);
          console.log("AutoStatus: completed 7 days.");
        } else {
          // schedule next
          state.nextSend = Date.now() + state.intervalMs;
          await writeState(state);
        }
      }
    } catch (e) {
      console.error("AutoStatus checker error:", e);
    }
  }, 60 * 1000); // every minute
}

async function stopChecker() {
  if (checkerHandle) {
    clearInterval(checkerHandle);
    checkerHandle = null;
  }
}

// plugin: main command handlers
lite({
  pattern: "autostatus",
  react: "📤",
  desc: "Manage Auto Status (owner only): on/off/status/list/add/remove/set",
  category: "owner",
  filename: __filename
}, async (conn, mek, m, { from, args, reply, isOwner }) => {
  try {
    if (!isOwner) return reply("❌ Only owner can use this command.");

    await ensureFiles();
    const cmd = (args[0] || '').toLowerCase();

    if (!cmd || cmd === 'help') {
      return reply(
`Usage:
.autostatus on [intervalHours]    - Start auto status (default interval 24h)
.autostatus off                   - Stop auto status
.autostatus status                - Show current status
.autostatus list                  - Show saved status list
.autostatus add <url>|<caption>   - Add new status item
.autostatus remove <index>        - Remove item (1-based)
.autostatus set                   - Replace entire list (follow instructions)
.autostatus help                  - Show this help`
      );
    }

    if (cmd === 'on') {
      const intervalHours = parseFloat(args[1]) || 24;
      const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;

      const list = await readList();
      if (!list || list.length === 0) return reply("❌ Status list is empty. Add items with `.autostatus add <url>|<caption>`");

      const state = await readState();
      if (state.running) return reply("⚠️ Auto Status already running.");

      // start immediately: send first right away then schedule nexts
      state.running = true;
      state.dayIndex = 0; // will be used by checker
      state.intervalMs = intervalMs;
      state.startedAt = Date.now();
      state.nextSend = Date.now(); // checker will pick it up immediately (within minute)
      await writeState(state);

      // start background checker if not started
      await startChecker(conn);

      return reply(`✅ Auto Status started. Interval: ${intervalHours} hour(s). First will send within a minute.`);
    }

    if (cmd === 'off') {
      const state = await readState();
      if (!state.running) return reply("⚠️ Auto Status not running.");
      state.running = false;
      state.nextSend = null;
      await writeState(state);
      return reply("✅ Auto Status stopped.");
    }

    if (cmd === 'status') {
      const state = await readState();
      const list = await readList();
      const running = !!state.running;
      const next = state.nextSend ? new Date(state.nextSend).toLocaleString() : 'N/A';
      const dayIndex = (state.dayIndex || 0);
      const total = Array.isArray(list) ? list.length : 0;
      return reply(
`🔎 Auto Status Info
Running : ${running ? 'Yes' : 'No'}
Started At : ${state.startedAt ? new Date(state.startedAt).toLocaleString() : 'N/A'}
Next Send : ${next}
Day Index : ${dayIndex} / ${total}
Interval (hours) : ${Math.round((state.intervalMs||0)/(60*60*1000))}`
      );
    }

    if (cmd === 'list') {
      const list = await readList();
      if (!list || list.length === 0) return reply("Status list is empty.");
      let out = "📜 Auto Status List:\n\n";
      list.forEach((it, i) => {
        out += `${i+1}. ${it.url}\n   ${it.caption}\n\n`;
      });
      return reply(out);
    }

    if (cmd === 'add') {
      const rest = args.slice(1).join(' ').trim();
      if (!rest || !rest.includes('|')) return reply("Usage: .autostatus add <imageUrl>|<caption>");
      const [url, ...capParts] = rest.split('|');
      const caption = capParts.join('|').trim();
      if (!url || !caption) return reply("Invalid format. Usage: .autostatus add <imageUrl>|<caption>");
      const list = await readList();
      list.push({ url: url.trim(), caption });
      await writeList(list);
      return reply(`✅ Added as item #${list.length}`);
    }

    if (cmd === 'remove') {
      const idx = parseInt(args[1]);
      if (!idx || idx < 1) return reply("Usage: .autostatus remove <index>");
      const list = await readList();
      if (idx > list.length) return reply("Index out of range.");
      const removed = list.splice(idx-1, 1);
      await writeList(list);
      return reply(`✅ Removed item ${idx}: ${removed[0].caption}`);
    }

    if (cmd === 'set') {
      // Replace whole list. For convenience, we instruct owner to send a JSON array in chat after .autostatus set command.
      // Expect: owner replies to this message with JSON array or sends new text containing JSON.
      // For simplicity: if the owner sends `.autostatus set` then the next message they send will be treated as JSON array.
      await reply("➡️ Send now the new list as a JSON array in one message. Example:\n[\n  {\"url\":\"https://...jpg\",\"caption\":\"Day 1\"},\n  {\"url\":\"https://...jpg\",\"caption\":\"Day 2\"}\n]\n\nReply with `cancel` to abort.");
      // Save a temporary marker state to know next message is the JSON data
      const markerPath = path.join(__dirname, '../my_data/autostatus_nextset.json');
      await fsp.writeFile(markerPath, JSON.stringify({ owner: true, createdAt: Date.now() }), 'utf8');
      return;
    }

    // If reached here, check if user sent JSON after 'set' prompt
    // If owner sends next message content (not a command) and marker exists, treat it as JSON
    // But this handler only runs on .autostatus command; to capture next message you'd need separate global 'on body' listener.
    // For simplicity we implement a simple file-check: if args[0] === 'applyset' then read from my_data/autostatus_pending.json
    if (cmd === 'applyset') {
      // optional helper to apply pending set (owner would have uploaded a file to my_data/autostatus_pending.json)
      const pendingPath = path.join(__dirname, '../my_data/autostatus_pending.json');
      if (!fs.existsSync(pendingPath)) return reply("No pending set file found. Use .autostatus set then paste JSON to file my_data/autostatus_pending.json");
      const raw = await fsp.readFile(pendingPath, 'utf8');
      let arr;
      try { arr = JSON.parse(raw); } catch (e) { return reply("Invalid JSON in pending file."); }
      if (!Array.isArray(arr)) return reply("JSON must be an array of objects {url, caption}");
      await writeList(arr);
      return reply(`✅ Replaced list with ${arr.length} items.`);
    }

    return reply("Unknown subcommand. Use `.autostatus help` for usage.");

  } catch (e) {
    console.error("autostatus command error:", e);
    reply("❌ Error in autostatus command.");
  }
});

// On bot start: ensure files and start checker with a conn once plugin loaded
(async () => {
  try {
    await ensureFiles();
    // Note: `startChecker` requires a conn reference. We will not auto-start it here because we don't have conn.
    // When the first .autostatus on command runs, startChecker(conn) will be called and continues running.
    // But to resume after bot restart, we rely on owner to send `.autostatus status` or `.autostatus on` again.
    // If you want automatic resume on startup, you can call startChecker(conn) from main bot init with the conn object.
  } catch (e) {
    console.error("AutoStatus init error:", e);
  }
})();
