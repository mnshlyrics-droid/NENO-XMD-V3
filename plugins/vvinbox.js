const { lite } = require("../lite");

lite({
  pattern: ".*", // all messages
  dontAddCommandList: true,
  filename: __filename
}, async (client, message, match, { from }) => {
  try {
    // reply check
    const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return;

    // detect ViewOnce
    const voMsg =
      quoted?.viewOnceMessage?.message ||
      quoted?.ephemeralMessage?.message?.viewOnceMessage?.message;
    if (!voMsg) return; // not view-once

    // extract inner type (image / video / audio)
    const mtype = Object.keys(voMsg)[0];
    const content = voMsg[mtype];
    if (!content) return;

    // download buffer
    const buffer = await client.downloadMediaMessage({ message: { [mtype]: content } });

    // build message
    let messageContent = {};
    if (mtype === "imageMessage") {
      messageContent = {
        image: buffer,
        caption: content.caption || "",
        mimetype: content.mimetype || "image/jpeg"
      };
    } else if (mtype === "videoMessage") {
      messageContent = {
        video: buffer,
        caption: content.caption || "",
        mimetype: content.mimetype || "video/mp4"
      };
    } else if (mtype === "audioMessage") {
      messageContent = {
        audio: buffer,
        mimetype: content.mimetype || "audio/mp4",
        ptt: content.ptt || false
      };
    } else {
      return; // ignore unsupported
    }

    // send unlocked media back
    await client.sendMessage(from, messageContent, { quoted: message });

    // react ✅ to user reply
    await client.sendMessage(from, { react: { text: "✅", key: message.key } });

  } catch (error) {
    console.error("Auto view-once unlock error:", error);
    // react ❌ if failed
    try {
      await client.sendMessage(from, { react: { text: "❌", key: message.key } });
    } catch {}
  }
});
