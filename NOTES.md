# Work Orders: project notes

Read this first before changing anything. It explains how the app is put together so any
future change (by Claude or a developer) starts with full context.

## What it is

A phone-first work order app for a property maintenance business with several crews
(Maintenance, Construction, Ranch, Mechanic shop). Live at **https://minits-app-c26e1.web.app**. Branding: Minits logo (`public/logo.svg`, `public/logo-mark.svg`), navy + cyan palette in `styles.css`.

- Hosting, sign-in, database and file storage: Firebase project `minits-app-c26e1` (Blaze plan).
- Code: plain JavaScript modules, no build step. Firebase SDK loads from Google's CDN (pinned to 10.14.1).
- Deploys automatically from GitHub on every push to `main` (`.github/workflows/deploy.yml`).

## Files

| Path | What's in it |
|---|---|
| `public/index.html` | Page shell, fonts, home-screen icon tags |
| `public/styles.css` | All styling (color tokens at the top, dark mode included) |
| `public/js/config.js` | **Settings**: Firebase keys, owner email, default teams, role names |
| `public/js/fb.js` | Firebase setup and the SDK functions the app uses |
| `public/js/store.js` | Live data listeners; screens read from `S` |
| `public/js/actions.js` | Every database write (jobs, time, parts, files, requests, people) |
| `public/js/auth.js` | Sign-in screens, first-time profile setup from invites |
| `public/js/main.js` | Start-up, bottom tabs, routing (`#/jobs`, `#/job/<id>`, ...), event wiring |
| `public/js/views/*.js` | One file per area: `jobs`, `time`, `requests`, `admin` (checklists, properties, team) |
| `firestore.rules` | Who can read/write what. **Change this with care.** |
| `storage.rules` | Who can upload/view photos and invoices |

## Roles

- **owner**: everything. Bootstrapped by signing in with `OWNER_EMAIL` (verified) the first time.
- **manager**: creates/assigns/edits jobs for their teams, edits checklists and properties, handles requests.
- **tech**: works their teams' jobs: status, checklist, time, parts, photos. Can create jobs for their team.
- **requester**: submits requests and sees their own. Sees nothing else.

People are added by the owner (Team screen) as an **invite** keyed by phone (`+15551234567`) or
lowercase email. On first sign-in the app copies the invite into `users/{uid}`; the rules check
the role and teams match the invite.

## Data (Firestore)

- `users/{uid}`: name, role, teams[], phone, email, active
- `invites/{phoneOrEmail}`: name, role, teams[]
- `teams/{id}`: name (`maintenance`, `construction`, `ranch`, `shop`)
- `properties/{id}`: name, address, info (crew-visible notes: shutoffs, filter sizes...)
- `checklists/{id}`: name, teamId?, propertyId?, items[] (lines starting `#` are section headers)
- `jobs/{id}`: number, title, teamId, propertyId, assigneeUid/Name, status (open|progress|parts|done),
  priority, due (YYYY-MM-DD), notes, checklist {name, items[{t,h?,d,by,byName,at}]},
  partsTotal, minutesTotal, filesCount (running totals), requestId, requestPhotos[], timestamps
  - `jobs/{id}/parts/{id}`: name, qty, cost, by, byName, at
  - `jobs/{id}/files/{id}`: path (Storage), name, type, kind (before|after|invoice|photo), by, at
- `time/{id}`: uid, name, jobId, jobNumber, jobTitle, teamId, propertyId, start, end (ms), minutes, manual
- `clock/{uid}`: the person's running clock (one job at a time)
- `requests/{id}`: by, byName, propertyId, text, urgency (later|week|urgent), guests, photos[], status (new|accepted|declined), jobId

Totals on a job (`partsTotal`, `minutesTotal`, `filesCount`) are kept up to date in the same
batch write as the part/time/file change.

Storage paths: `jobs/<jobId>/<file>` and `requests/<uid>/<file>`. Photos are shrunk to 1800px before upload.

## Making a change

1. Edit the files. Keep writes in `actions.js` and permissions in `firestore.rules`.
2. If a screen reads a new collection, add a listener in `store.js` **and** a rule for it.
3. Commit and push to `main`. GitHub deploys in about 2 minutes. Crew get it next time they open the app.

## Deploying (one-time setup)

GitHub needs a key to deploy to Firebase:
1. Google Cloud console → IAM & Admin → Service Accounts (project `minits-app-c26e1`) → Create service account `github-deploy`.
2. Roles: **Firebase Admin**, **Service Usage Consumer**, **Cloud Datastore Index Admin**.
3. Open it → Keys → Add key → JSON. A file downloads.
4. GitHub repo → Settings → Secrets and variables → Actions → New repository secret
   `FIREBASE_SERVICE_ACCOUNT`, paste the whole file's contents. Then delete the downloaded file.
5. Actions tab → Deploy → Run workflow.

## Roadmap (designed, not built yet)

Mockups: the "Work Orders App Mockups" design canvas. Next stages, roughly in order:
1. Recurring maintenance by property (scheduled job creation needs a Cloud Function).
2. Airbnb calendar sync (iCal per listing → turnover jobs; Cloud Function on a schedule).
3. Notifications (texts/push for urgent requests, assignments, overdue).
4. Reports + spreadsheet export (owner only), hourly rates.
5. Mechanic shop: equipment list (shop + owner only), unit history, service by hours/miles, QR stickers.
6. Property status board, construction budgets/phases, vendors, timesheet approval.

## Known limits of this first version

- Changing someone's role or teams takes effect for them after they reload the app.
- Techs can see photos from any team's jobs if they have the file link (storage rules check staff, not team).
- Offline: the app keeps working with weak signal and syncs later; photo uploads need a connection.
