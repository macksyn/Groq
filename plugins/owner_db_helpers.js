// plugins/owner_db_helpers.js
import { getCollection } from '../lib/mongoManager.js';

const BAN_COLLECTION = 'banned_users';
const ADMIN_COLLECTION = 'admin_users';

export async function banUser(phone) {
  const col = await getCollection(BAN_COLLECTION);
  await col.updateOne({ phone }, { $set: { phone } }, { upsert: true });
}

export async function unbanUser(phone) {
  const col = await getCollection(BAN_COLLECTION);
  await col.deleteOne({ phone });
}

export async function getBannedUsers() {
  const col = await getCollection(BAN_COLLECTION);
  return await col.find({}).toArray();
}

export async function addAdmin(phone) {
  const col = await getCollection(ADMIN_COLLECTION);
  await col.updateOne({ phone }, { $set: { phone } }, { upsert: true });
}

export async function removeAdmin(phone) {
  const col = await getCollection(ADMIN_COLLECTION);
  await col.deleteOne({ phone });
}

export async function getAdmins() {
  const col = await getCollection(ADMIN_COLLECTION);
  return await col.find({}).toArray();
}
