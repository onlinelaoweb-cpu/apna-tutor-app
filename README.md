# Apna Tutor — CBSE Home Companion

A home tutoring app for your kids: an AI chat tutor tuned to each child's grade,
CBSE-style practice quizzes, and per-child progress tracking.

## 1. Get an Anthropic API key

1. Go to https://console.anthropic.com and sign up / log in.
2. Create an API key (this is billed separately, pay-as-you-go, from your claude.ai
   subscription — usage for a family app like this is typically very cheap).
3. Keep the key handy for step 3 below.

## 2. Run it locally (optional, to try it first)

```bash
npm install
cp .env.example .env
# edit .env and paste your key after ANTHROPIC_API_KEY=
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
   - `ANTHROPIC_API_KEY` = your key from step 1
   (Do NOT commit your real `.env` file to GitHub — it's already in `.gitignore`.)
4. Open the **Settings → Networking** tab and click **Generate Domain** to get a
   public URL for the app.
5. Visit the URL — you should see the app live. Add your children's profiles
   and try a chat question or quiz.

## Notes on data

- All child profiles and quiz history are stored in a `data.json` file next to
  the server code — simple and enough for a family app.
- On Railway's free/basic tier, the filesystem can reset on redeploys. If you
  want quiz history to survive redeploys long-term, add a **Railway Volume**
  (Settings → Volumes) mounted at the project folder — Railway's docs walk
  through this in a couple of clicks.

## Notes on cost

- Every chat message and every quiz generated makes one call to the Anthropic
  API, billed to your API key — not your claude.ai plan.
- For light home use (a few chats/quizzes a day per child), costs are typically
  a small fraction of a dollar per month, but keep an eye on
  https://console.anthropic.com usage if you want to be sure.
