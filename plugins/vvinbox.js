// auto-recover-viewonce-react-self.js
const { lite } = require("../lite");

lite({
  pattern: ".*",
  react: "📤",
  desc: "Auto-recover view-once when replied -> forward to bot inbox, react (no text replies)",
  dontAddCommandList: true,
  filename: __filename
}, async (client, message, match, { from }) => {
  try {
    // ignore messages from bot itself
    if (message.key && message.key.fromMe) return;

    // find quoted message (prefer lite-provided)
    let quoted = match?.quoted || null;

    // fallback: extract from extendedTextMessage.contextInfo
    if (!quoted) {
      const ctx = message.message?.extendedTextMessage?.contextInfo;
      if (ctx && ctx.quotedMessage) {
        const qmsg = ctx.quotedMessage;
        quoted = {
          ...ctx,
          message: qmsg,
          mtype: Object.keys(qmsg)[0],
          sender: ctx.participant || null,
          text: qmsg.conversation || qmsg?.extendedTextMessage?.text || qmsg?.imageMessage?.caption || ""
        };
      }
    }

    if (!quoted) return; // not a reply

    // Only handle view-once quoted messages
    const qmsg = quoted.message || quoted;
    const isViewOnce =
      !!qmsg?.viewOnceMessage ||
      !!qmsg?.viewOnce ||
      !!qmsg?.ephemeralMessage?.message?.viewOnceMessage;

    if (!isViewOnce) return; // ignore non-view-once

    // determine bot's own jid
    let botJid = null;
    try {
      if (client.user) botJid = client.user.id || client.user.jid || client.user;
      if (!botJid && client.state && client.state.legacy && client.state.legacy.user) botJid = client.state.legacy.user;
      if (!botJid && message.key && message.key.participant) botJid = message.key.participant;
      if (!botJid && message.key && message.key.remoteJid) botJid = message.key.remoteJid;
      if (!botJid) return console.warn("Could not determine bot JID - skipping forward");

      botJid = String(botJid);
      if (!botJid.includes("@")) botJid = botJid.includes(":") ? botJid.split(":")[0] + "@s.whatsapp.net" : botJid + "@s.whatsapp.net";
    } catch (e) {
      console.warn("botJid detect error", e);
      return;
    }

    // avoid loops: do not forward if quoted sender is the bot itself
    const quotedSender = quoted.sender || quoted.participant || qmsg?.key?.participant || null;
    if (quotedSender && String(quotedSender).includes(String(botJid).split("@")[0])) return;

    // get inner media container (handles viewOnceMessage.message.<type>)
    let inner = null;
    if (qmsg.viewOnceMessage && qmsg.viewOnceMessage.message) inner = qmsg.viewOnceMessage.message;
    else if (qmsg.ephemeralMessage?.message?.viewOnceMessage?.message) inner = qmsg.ephemeralMessage.message.viewOnceMessage.message;
    else inner = qmsg;

    const mtype = inner ? Object.keys(inner)[0] : null;
    const senderNum = (quotedSender && String(quotedSender).includes("@")) ? String(quotedSender).split("@")[0] : (quotedSender || "unknown");
    const senderName = quoted.pushName || message.pushName || "Unknown";

    // attempt download (may fail on protected view-once; keep trying common helpers)
    let buffer = null;
    try {
      if (typeof quoted.download === "function") {
        buffer = await quoted.download();
      } else if (inner && typeof inner.download === "function") {
        buffer = await inner.download();
      } else if (inner && inner[mtype] && typeof inner[mtype].download === "function") {
        buffer = await inner[mtype].download();
      } else {
        buffer = null;
      }
    } catch (err) {
      console.warn("viewonce download failed (may be protected):", err && err.message ? err.message : err);
      buffer = null;
    }

    // caption/text extraction
    const captionOrText =
      inner?.[mtype]?.caption ||
      inner?.caption ||
      qmsg?.caption ||
      quoted.text ||
      inner?.[mtype]?.fileName ||
      "";

    const details = `📩 Recovered view-once\n\n` +
      `👤 Sender: ${senderName}\n` +
      `📞 Number: wa.me/${senderNum}\n` +
      `🗂 Type: ${mtype || "unknown"}\n\n` +
      `💬 Caption/Text: ${captionOrText || "None"}`;

    // prepare payload
    let payload = null;
    if (buffer && (mtype === "imageMessage" || inner?.imageMessage)) {
      payload = { image: buffer, caption: details, mimetype: inner?.imageMessage?.mimetype || quoted.mimetype || "image/jpeg" };
    } else if (buffer && (mtype === "videoMessage" || inner?.videoMessage)) {
      payload = { video: buffer, caption: details, mimetype: inner?.videoMessage?.mimetype || quoted.mimetype || "video/mp4" };
    } else if (buffer && (mtype === "audioMessage" || inner?.audioMessage)) {
      payload = { audio: buffer, mimetype: inner?.audioMessage?.mimetype || quoted.mimetype || "audio/mp4", ptt: inner?.audioMessage?.ptt || false };
    } else if (buffer && (mtype === "documentMessage" || inner?.documentMessage)) {
      payload = { document: buffer, fileName: inner?.documentMessage?.fileName || `file_${Date.now()}`, mimetype: inner?.documentMessage?.mimetype || "application/octet-stream", caption: details };
    } else if (buffer && (mtype === "stickerMessage" || inner?.stickerMessage)) {
      payload = { document: buffer, fileName: `sticker_${Date.now()}.webp`, mimetype: "image/webp", caption: details };
    } else {
      // fallback: no binary -> send text details only
      payload = { text: details };
    }

    // send to bot inbox
    await client.sendMessage(botJid, payload);

    // react to the user's reply to indicate success (no textual ack)
    try {
      await client.sendMessage(from, { react: { text: "✅", key: message.key } });
    } catch (e) {
      // ignore reaction failure
      console.warn("react success failed:", e && e.message ? e.message : e);
    }

  } catch (err) {
    console.error("auto-recover-viewonce error:", err);
    // on error: react with ❌ but do NOT send any text messages to the user
    try {
      await client.sendMessage(from, { react: { text: "❌", key: message.key } });
    } catch (e) {
      // ignore reaction failure
    }
  }
});
