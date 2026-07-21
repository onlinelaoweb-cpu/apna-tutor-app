// Minimal file-based JSON store. Good enough for a small family app.
// Data lives in data.json inside DATA_DIR - set DATA_DIR to a Railway Volume mount
// path (e.g. /data) so profiles and progress survive redeploys. Without it, this
// falls back to storing next to the code, which Railway wipes on every redeploy.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'data.json');

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.topicLog)) data.topicLog = []; // backward-compatible with older data.json files
    return data;
  } catch (e) {
    return { profiles: [], progress: [], topicLog: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = {
  getProfiles() {
    return readDB().profiles;
  },
  addProfile(profile) {
    const data = readDB();
    data.profiles.push(profile);
    writeDB(data);
  },
  deleteProfile(id) {
    const data = readDB();
    data.profiles = data.profiles.filter((p) => p.id !== id);
    data.progress = data.progress.filter((entry) => entry.profileId !== id);
    data.topicLog = data.topicLog.filter((entry) => entry.profileId !== id);
    writeDB(data);
  },
  getProgress(profileId) {
    const data = readDB();
    return data.progress
      .filter((entry) => entry.profileId === profileId)
      .sort((a, b) => b.id - a.id);
  },
  addProgress(profileId, entry) {
    const data = readDB();
    const id = data.progress.length ? Math.max(...data.progress.map((e) => e.id)) + 1 : 1;
    data.progress.push({ id, profileId, ...entry });
    writeDB(data);
  },
  // Topic log powers the "welcome back, let's recap" feature - a lightweight record
  // of what subject/topic a child engaged with on which day.
  getTopicLog(profileId, subject) {
    const data = readDB();
    return data.topicLog.filter((e) => e.profileId === profileId && e.subject === subject);
  },
  addTopicLog(profileId, entry) {
    const data = readDB();
    data.topicLog.push({ profileId, ...entry });
    writeDB(data);
  },
};