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
  // Powers streaks and badges - derives everything from data already being logged,
  // no separate tracking needed.
  getEngagementStats(profileId) {
    const data = readDB();
    const topicEntries = data.topicLog.filter((e) => e.profileId === profileId);
    const progressEntries = data.progress.filter((e) => e.profileId === profileId);

    const activeDates = [...new Set([
      ...topicEntries.map((e) => e.date),
      ...progressEntries.map((e) => e.date),
    ])].sort();

    const subjects = new Set([
      ...topicEntries.map((e) => e.subject),
      ...progressEntries.map((e) => e.subject),
    ]);

    const quizCount = progressEntries.length;
    const perfectScores = progressEntries.filter((e) => e.total > 0 && e.score === e.total).length;

    // Longest streak: scan for the longest run of consecutive calendar days.
    let longestStreak = 0, run = 0, prevDate = null;
    for (const d of activeDates) {
      if (prevDate) {
        const diffDays = Math.round((new Date(d) - new Date(prevDate)) / 86400000);
        run = diffDays === 1 ? run + 1 : 1;
      } else {
        run = 1;
      }
      longestStreak = Math.max(longestStreak, run);
      prevDate = d;
    }

    // Current streak: consecutive days ending today or yesterday (so it doesn't
    // reset to 0 the moment midnight passes before they've had a chance today).
    let currentStreak = 0;
    if (activeDates.length) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dateSet = new Set(activeDates);
      let cursor = new Date(today);
      const todayStr = cursor.toISOString().slice(0, 10);
      if (!dateSet.has(todayStr)) cursor.setDate(cursor.getDate() - 1); // allow starting from yesterday
      while (dateSet.has(cursor.toISOString().slice(0, 10))) {
        currentStreak++;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    const badgeDefs = [
      { id: 'first_step', label: 'First Lesson', icon: '🌱', earned: activeDates.length >= 1 },
      { id: 'streak_3', label: '3-Day Streak', icon: '🔥', earned: longestStreak >= 3 },
      { id: 'streak_7', label: 'Week Streak', icon: '⭐', earned: longestStreak >= 7 },
      { id: 'streak_14', label: 'Two-Week Streak', icon: '🏆', earned: longestStreak >= 14 },
      { id: 'streak_30', label: 'Month Streak', icon: '👑', earned: longestStreak >= 30 },
      { id: 'quiz_5', label: '5 Quizzes Done', icon: '📝', earned: quizCount >= 5 },
      { id: 'quiz_20', label: '20 Quizzes Done', icon: '📚', earned: quizCount >= 20 },
      { id: 'perfect_score', label: 'Perfect Score', icon: '💯', earned: perfectScores >= 1 },
      { id: 'multi_subject', label: 'Well-Rounded', icon: '🌍', earned: subjects.size >= 3 },
    ];

    return { currentStreak, longestStreak, activeDays: activeDates.length, badges: badgeDefs };
  },
};