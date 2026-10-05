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

**Registered the runner by hand instead** (the commands GitHub shows on the "New self-hosted runner" page)? That works too; the workflow only needs the default `self-hosted` + `macOS` labels. Two things the script does for you that you then need to do yourself, from the runner folder:

```bash
echo "$PATH" > .path          # so the background service can find docker (run this in a terminal where `docker` works)
./svc.sh install && ./svc.sh start   # run as a service instead of ./run.sh, so it survives closing the terminal and reboots
```

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

## The iPhone app builds automatically too

The `ios` job (same runner, after `check` passes) runs `scripts/ios-device.sh`: build → sync → sign → install on your iPhone. It runs on every merge to `main`, **daily at 17:30 UTC**, and from *Actions → CI/CD → Run workflow*.

- **No phone, no problem:** if no paired iPhone is reachable, the job is skipped (green), not failed.
- **Installs only, never opens the app**, so a merge doesn't kick you out of Garaj. Your data stays (same app, updated in place).
- **The daily run matters:** with a free Apple team the app expires after 7 days; the daily install renews it whenever the phone is reachable.

One-time phone setup:
1. Plug the iPhone in once, unlock it, tap **Trust**. Settings → Privacy & Security → **Developer Mode** on.
2. Xcode → Window → Devices and Simulators → select the phone → tick **Connect via network**. (Then it works over Wi‑Fi with no cable, if both are on the same network and the phone is awake.)
3. The first automatic build may show a macOS prompt "codesign wants to access key…". Click **Always Allow** once.
4. The Mac must be logged in (the runner is a user service) and Xcode signed in to your Apple ID, as for `npm run ios:device`.

Not verified in the sandbox this was written in (no Xcode there); the first real run is on your Mac. If the `ios` job fails, open its log; the failing step and message are all that's needed.

## Things to know

- **Not containerized: the iPhone build.** It needs Xcode and the phone, so it runs natively on the Mac (see above). The container only serves the web build.
- **The Mac must be awake and Docker running** for deploys to land (System Settings → Battery/Energy → prevent sleep when plugged in; a missed deploy just waits for the Mac to come back).
- **Per-browser data.** The site at `http://<mac>:8080` is a different origin from `localhost:3000`, so it has its own empty data. Browsers also treat plain `http://` on a LAN IP as an insecure context: storage works, but clipboard/share APIs may not. Use `localhost` on the Mac itself, or put HTTPS in front (Tailscale or Caddy) if you need those on other devices.
- **Self-hosted runners and public repos.** Keep this repository private, or leave the default setting that requires approval for fork pull requests; never make the `deploy` job run for `pull_request` events.
- **`npm run autopull`** (the git auto-pull from earlier) is independent: it keeps your *source checkout* on the latest `main`; this pipeline keeps the *running container* on the latest `main`.
- Remove the runner: `RUNNER_TOKEN=<remove token> npm run runner:uninstall`.
