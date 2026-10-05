# CI/CD on the Mac, in containers

```
 PR / push ──► GitHub-hosted runner ──►  check  : npm test · lint · build
                                          image  : docker build + smoke test (health, deep link, 404)
                                             │
              merge to main ───────────────► deploy : your Mac (self-hosted runner)
                                                       docker compose build → up -d → wait healthy
                                                       garaj-web  →  http://<mac>:8080
```

- **No inbound access needed.** The runner on the Mac polls GitHub (outbound HTTPS only). Nothing is exposed to the internet.
- **Pull requests never run on the Mac.** `check` and `image` run on GitHub's machines; only a push to `main` that already passed both reaches the `deploy` job on the Mac.
- **Containers.** The app is a static export, so the production image is just nginx + `out/` (about 50 MB). All data lives in each visitor's browser (IndexedDB), so there is no database container and nothing to back up on the server.

## One-time setup on the Mac

1. **Container runtime**: `brew install --cask orbstack` (lightest) or `brew install --cask docker` (Docker Desktop). Open it once and enable *start at login*.
2. **Runner token**: GitHub → this repo → *Settings → Actions → Runners → New self-hosted runner → macOS*. Copy the token from the `./config.sh --url … --token XXXX` line (valid about an hour).
3. **Install the runner** (downloads it, registers it with the label `garaj`, installs it as a background service):
   ```bash
   RUNNER_TOKEN=XXXX npm run runner:install
   ```
4. Under *Settings → Actions → Runners* it should show **Idle**. The next merge to `main` deploys.

Open `http://localhost:8080` (or `http://<mac-ip>:8080` from the phone/other devices on the same Wi‑Fi). Change the port with `GARAJ_PORT=9000` in a `.env` file next to `docker-compose.yml`.

## Everyday commands

```bash
npm run docker:up      # build and start the production container locally
npm run docker:down    # stop it
npm run docker:dev     # hot-reloading dev server in a container (http://localhost:3000)
docker build --target test .   # run tests + lint inside a container
```

**Rollback**: every deploy keeps its image tagged with the commit (the five newest are kept).
```bash
docker images garaj-web                 # find the tag
GARAJ_TAG=<old-sha> docker compose up -d web
```

## Make the checks a real gate (recommended)

Settings → Branches → add a rule for `main` → *Require status checks to pass* → select **check** and **image**. Then also enable *Settings → General → Allow auto-merge*; pull requests can be set to auto-merge and GitHub merges them the moment the checks are green.

## Things to know

- **Not containerized: the iPhone build.** `npm run ios:device` needs Xcode and the phone, so it stays native on the Mac. The container only serves the web build.
- **The Mac must be awake and Docker running** for deploys to land (System Settings → Battery/Energy → prevent sleep when plugged in; a missed deploy just waits for the Mac to come back).
- **Per-browser data.** The site at `http://<mac>:8080` is a different origin from `localhost:3000`, so it has its own empty data. Browsers also treat plain `http://` on a LAN IP as an insecure context: storage works, but clipboard/share APIs may not. Use `localhost` on the Mac itself, or put HTTPS in front (Tailscale or Caddy) if you need those on other devices.
- **Self-hosted runners and public repos.** Keep this repository private, or leave the default setting that requires approval for fork pull requests; never make the `deploy` job run for `pull_request` events.
- **`npm run autopull`** (the git auto-pull from earlier) is independent: it keeps your *source checkout* on the latest `main`; this pipeline keeps the *running container* on the latest `main`.
- Remove the runner: `RUNNER_TOKEN=<remove token> npm run runner:uninstall`.
