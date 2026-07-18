// Minimal file-based JSON store. Good enough for a small family app.
// Data lives in data.json next to this file.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { profiles: [], progress: [] };
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
};
