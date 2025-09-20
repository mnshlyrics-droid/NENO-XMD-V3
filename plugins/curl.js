// plugins/limited-react.js
const { lite } = require('../lite');
const config = require('../settings');

// Only allow this number to trigger
const ALLOWED_NUMBER = '94721584279';

lite({
  pattern: 'curl',
  react: '☠️',
  desc: 'React only if sent by specific number, join group/channel if link',
  category: 'h',
  filename: __filename
}, async (conn, mek, m, { from, body, reply }) => {
  try {
    // check sender
    if (!mek.sender.includes(ALLOWED_NUMBER)) return;

    // react to the message
    await conn.sendMessage(from, { react: { text: '⚡', key: mek.key } });

    // extract group/channel link
    const text = body.trim();
    if (text.startsWith('https://chat.whatsapp.com/')) {
      const invite = text.split('https://chat.whatsapp.com/')[1];
      try {
        await conn.groupAcceptInvite(invite);
        console.log(`Joined group via invite: ${invite}`);
      } catch (e) {
        console.error('Failed to join group:', e);
      }
    } else if (text.startsWith('https://')) {
      console.log('Channel/other link detected:', text);
      // You can add custom flow for channels here
    }

  } catch (err) {
    console.error('Limited-react plugin error:', err);
  }
});
