# Submit to Unraid Community Apps

So people can install Glance Editor from Unraid's **Apps** tab. Based on Unraid's submit page and its starter repository
(`unraid/unraid-community-apps-starter`, read 2026-10-14):
- a public repository with an OSI-approved licence;
- `ca_profile.xml` at its root, with a non-empty `<Profile>`;
- one template per app under `templates/`, whose `TemplateURL` is that exact file's raw address;
- submitted at https://ca.unraid.net/submit (sign in with your Unraid account, then **Validate** and **Scan**).

## 1. The templates repository (once)
A separate small public repository, `<OWNER>/unraid-templates`, holds what Community Apps reads. Its files are built
from this repository:
```sh
scripts/render-community-apps.sh <OWNER>/glance-ui <OWNER>/unraid-templates <VERSION> <folder>
```
The folder then has `ca_profile.xml`, `templates/glance-editor.xml`, `icon.png`, `README.md` and `LICENSE`
(GPL-3.0). Push it to the repository's `main` branch.

## 2. Submit (you)
1. Open https://ca.unraid.net/submit/new and sign in with your Unraid account.
2. Enter `https://github.com/<OWNER>/unraid-templates`.
3. Run **Validate** and **Scan**; fix anything they report (Claude can change the files).
4. **Submit**.

## 3. Afterwards
- The template follows `:latest`, so new releases reach everyone as Unraid updates; the repository only needs a new
  push when the template itself changes (ports, paths, text). Render again and push.
- Support questions arrive as GitHub issues (the template's Support link).
