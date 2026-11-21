# Apna Tutor — CBSE Home Companion

A home tutoring app for your kids: an AI chat tutor tuned to each child's grade,
CBSE-style practice quizzes, and per-child progress tracking.

## 1. Get a FREE AI key (Google Gemini)

1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Press **Create API key** and copy it. No credit card is needed for the free tier.
3. Keep the key handy for step 3 below.

The free tier has daily limits that Google can change. If the limit is reached, or the AI is
unreachable, the app does not break: quizzes (Maths, Science, English, Social Science, EVS,
Current Affairs), Maths worksheets and Spelling practice switch to built-in offline versions.
Only the live tutor chat, photo questions and other subjects wait until the limit resets.

**Privacy note:** on Google's free tier, the text and photos sent to the AI can be used by Google
to improve its products and may be read by reviewers. The app never sends a child's name, only
the grade, subject and what is typed, spoken or photographed. If you prefer more privacy, use a
paid key or set `AI_PROVIDER=none`.

Prefer Claude instead? Set `AI_PROVIDER=claude` and `ANTHROPIC_API_KEY` (that one is billed per use).

## 2. Run it locally (optional, to try it first)

```bash
npm install
cp .env.example .env
# edit .env and paste your key after GEMINI_API_KEY=
npm start
```

Then open http://localhost:3000 in your browser.

## 3. Deploy to Railway

1. Push this folder to a new GitHub repository (Railway deploys from GitHub).
   - Create a repo on github.com, then from this folder:
     ```bash
     git init
     git add .
     git commit -m "Apna Tutor initial version"
     git branch -M main
     git remote add origin https://github.com/<your-username>/<your-repo>.git
     git push -u origin main
     ```
2. On https://railway.com, click **New Project → Deploy from GitHub repo**, and
   pick this repository. Railway auto-detects it's a Node.js app.
3. Open the new service's **Variables** tab and add:
   - `AI_PROVIDER` = `gemini`
   - `GEMINI_API_KEY` = your free key from step 1
   (Do NOT commit your real `.env` file to GitHub — it's already in `.gitignore`.)
4. Open the **Settings → Networking** tab and click **Generate Domain** to get a
   public URL for the app.
5. Visit the URL — you should see the app live. Add your children's profiles
   and try a chat question or quiz.

## Making profiles permanent (important - do this once)

By default, Railway wipes its filesystem on every redeploy — which means every
time you push an updated file, your child profiles, quiz history, and topic
log get reset to zero. Fix this once with a **Railway Volume**, a small
persistent disk that survives redeploys:

1. In Railway, open your service → **Settings → Volumes → + New Volume**
2. Set the **mount path** to `/data`
3. Go to **Variables** and add: `DATA_DIR` = `/data`
4. Redeploy (Railway will do this automatically after saving the variable)

That's it — your database file now lives on the persistent volume instead of
the app code's ephemeral filesystem, so future updates never touch it again.
If you skip this step, everything still works, but profiles reset to empty
on every redeploy.

## Notes on cost

- With `AI_PROVIDER=gemini` the AI part costs nothing (free tier, no card).
- `DAILY_AI_LIMIT` (default 300) stops the app from using more than that many AI calls a day.
- Leave `GOOGLE_TTS_API_KEY` empty to stay at zero cost; the browser's built-in voice is used.
- Railway hosting itself is a separate charge after its free trial. To pay nothing at all you can
  run the app on a free host or on your own computer (`npm start`).
- `GET /api/ai/status` shows which AI is active.
## Read & Write (Padho-Likho)

A tab for children who need help with reading fluency and handwriting speed (`public/readwrite.js`):

- **Zor se padho** – timed reading aloud with speech recognition; shows words/min, accuracy, and highlights missed words (tap to correct).
- **Word Flash** – 60-second sight-word rounds.
- **Copy-book** – dictation/copy sentences into a real notebook, timed, parent checks neatness.
- **Vakya banao** – arrange scrambled words into sentences.
- **Meri speed** – progress chart and a daily 15-minute plan.

Works offline with built-in content; AI is only used for "new story". Results are saved to Progress (subjects Reading / Writing) and count toward streaks.

## Homework, revision and weekly report

`public/extras.js`: a Homework planner tab (per child, stored in the browser), a "Revise" list of topics scoring under 60% (one tap starts a quiz), and a weekly parent report that can be sent via WhatsApp (Progress tab).
