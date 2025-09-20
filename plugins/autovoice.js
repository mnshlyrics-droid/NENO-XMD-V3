const fs = require('fs');
const path = require('path');
const config = require('../settings');
const { lite, commands } = require('../lite');

// auto_voice
lite({
  on: "body"
},    
async (conn, mek, m, { from, body, isOwner }) => {
    try {
        const filePath = path.join(__dirname, '../all/autovoice.json');
        if (!fs.existsSync(filePath)) return;
        
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const text in data) {
            if (body.toLowerCase() === text.toLowerCase()) {
                if (config.AUTO_VOICE === 'true') {
                    await conn.sendPresenceUpdate('recording', from);
                    await conn.sendMessage(
                      from,
                      { audio: { url: data[text] }, mimetype: 'audio/mpeg', ptt: true },
                      { quoted: mek }
                    );
                }
            }
        }
    } catch (e) {
        console.error("AutoVoice error:", e);
    }
});
