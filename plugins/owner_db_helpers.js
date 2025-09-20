// Add this to your owner_db_helpers.js file

import { getCollection } from '../lib/mongoManager.js';

const BOT_SETTINGS_COLLECTION = 'bot_settings';

export async function setBotMode(mode) {
  const col = await getCollection(BOT_SETTINGS_COLLECTION);
  await col.updateOne(
    { setting: 'bot_mode' }, 
    { $set: { setting: 'bot_mode', value: mode, updatedAt: new Date() } }, 
    { upsert: true }
  );
}

export async function getBotMode() {
  const col = await getCollection(BOT_SETTINGS_COLLECTION);
  const result = await col.findOne({ setting: 'bot_mode' });
  return result?.value || 'public'; // Default to public
}

export async function isBotPublic() {
  const mode = await getBotMode();
  return mode === 'public';
}
