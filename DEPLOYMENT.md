# GitHub Packaging and Deployment

This project can be stored in a private GitHub repository.

## Recommended Setup for 3-5 Admins

Use a private GitHub repo for source control, then deploy the Python admin server
to a small internal host or a Python-capable platform such as Azure App Service,
Render, Fly.io, or an NTUH-managed VM.

GitHub Pages is suitable only for read-only static previews. It cannot run
`scripts/admin_server.py`, cannot enforce edit locks, and cannot save drafts.

## Files to Commit

Commit:

- `admin-portal.html`
- `web-preview.html`
- `email-preview.html`
- `scripts/`
- `data/resource_mapping.json`
- `data/admin_schema.json`
- `data/admin_users.example.json`
- `data/*_template.csv`
- `assets/`
- `README.md`
- `DEPLOYMENT.md`
- `Procfile`
- `requirements.txt`

Do not commit:

- `data/admin_users.json`
- `*.log`
- `__pycache__/`
- `preview-*.png`

`output/` is ignored by default because generated issues can be rebuilt. If you
want GitHub Pages to serve generated static issue HTML, remove `output/` from
`.gitignore` and commit only approved output.

## First-Time GitHub Push

Run these commands from this folder:

```powershell
git init
git add .
git commit -m "Initial CDC weekly admin portal"
git branch -M main
git remote add origin https://github.com/<org-or-user>/<private-repo>.git
git push -u origin main
```

Use a private repository because draft content and resource links may be internal.

## Local Admin Users

For local prototype login:

```powershell
Copy-Item data/admin_users.example.json data/admin_users.json
python scripts/make_admin_user.py --passcode "replace-with-real-passcode"
```

Paste the generated hash into `data/admin_users.json`.

For production, prefer hospital SSO/AD and replace the local passcode prototype.

## Start Locally

```powershell
python scripts/admin_server.py 8787
```

Open:

```text
http://127.0.0.1:8787/
```

## Start on a Host

Set environment variables:

```text
HOST=0.0.0.0
PORT=<platform-provided-port>
```

Start command:

```text
python scripts/admin_server.py
```

The app remains preview/edit/archive only. It has no send-email or publish
endpoint.
