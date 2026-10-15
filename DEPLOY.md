# Deploying the DSA tracker

The app runs on Render (free). Accounts and progress are saved as
`users/<mobile>_<name>.json` in a separate **private** GitHub repo.

## 1. Create the data repo
1. On GitHub: **New repository**.
2. Name: `dsa-tracker-data` (any name works). Visibility: **Private**.
3. Tick **Add a README file** so the repo has a `main` branch. Create it.

## 2. Create a token that can only write to that repo
1. GitHub → your avatar → **Settings** → **Developer settings** →
   **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Name: `dsa-tracker`. Expiration: the longest offered (note the date; you'll renew it then).
3. **Repository access** → **Only select repositories** → pick `dsa-tracker-data`.
4. **Permissions** → **Repository permissions** → **Contents** → **Read and write**.
5. **Generate token** and copy it now (it starts with `github_pat_`). It is shown only once.
   Never put it in the code or commit it.

## 3. Push the app code to GitHub
The code repo needs `index.html`, `server.mjs`, `package.json` and `.gitignore`.
If the code repo isn't yours, fork it first and use your fork.

```bash
git add index.html server.mjs package.json .gitignore DEPLOY.md
git commit -m "Save accounts to a GitHub repo; deploy on Render"
git push
```

## 4. Create the web service on Render
1. Sign up at https://render.com with your GitHub account.
2. **New** → **Web Service** → connect GitHub and choose the **code** repo (not the data repo).
3. Settings:
   - Language: **Node**
   - Branch: `main`
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: **Free**
4. **Environment variables** (add before the first deploy):

   | Key | Value |
   |---|---|
   | `GITHUB_TOKEN` | the token from step 2 |
   | `GITHUB_REPO` | `your-github-username/dsa-tracker-data` |

   Optional: `GITHUB_BRANCH` (default `main`), `FLUSH_MS` (default `5000`, how long to batch saves).
5. **Create Web Service**. When the log shows
   `Accounts save to github.com/<you>/dsa-tracker-data (main) in users/`, it's live.

## 5. Use it
1. Open `https://<service-name>.onrender.com` on any device.
2. **Sign in** → enter mobile, name and password → **Create account** (once per person).
3. On other devices, sign in with the same mobile, name and password.
4. Check `dsa-tracker-data/users/` on GitHub: each person has one JSON file, and each save is a commit.

## Good to know
- The free instance sleeps after ~15 minutes idle; the first visit after that takes 30–60 seconds.
- Progress saves are batched: one commit at most every 5 seconds per person. When Render
  stops the server it writes anything pending first. Each browser also keeps its own copy.
- If saving stops working, the token has probably expired: create a new one (step 2) and
  replace `GITHUB_TOKEN` on Render (**Environment** → edit → **Save**, which redeploys).
- Running locally without the GitHub variables saves to the `users/` folder instead:
  `node server.mjs`, then open the address it prints.
