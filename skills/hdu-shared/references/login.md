# Login

HDU systems use one unified identity login (杭电统一身份认证, `sso.hdu.edu.cn`). hdu saves that session encrypted on the user's machine (macOS Keychain / Windows DPAPI) and silently renews each site's session from it. The user only logs in again when the SSO session itself expires.

## Check

```bash
hdu auth status --json
```

`data.sso` is the SSO session; `data.services.jw` / `data.services.job` show whether each site is usable.

## Log in (you start it, the user scans)

Login is a DingTalk QR scan that only the user can complete on their phone. You can start it for them:

1. Run in the **background** (it waits up to 5 minutes for the scan):

   ```bash
   hdu auth login --json --open
   ```

2. Read stdout line by line. The first line is

   ```json
   {"ok": true, "event": "qr_code", "data": {"image": "/tmp/.../login-qr.png", "opened": true, "message": "…"}}
   ```

   `--open` has already popped the QR image up in the system image viewer. Tell the user: "A DingTalk login QR code has opened in a window — scan it with DingTalk and confirm on your phone." If your client can display local images, also show `data.image`; if the user cannot see the window, give them the path.
3. If another `qr_code` line arrives, the code expired and was refreshed (the window reopens) — tell the user to scan the new one.
4. The last line has no `event`: `{"ok": true, "data": {"sso": true, "services": {…}}}` means success — retry the user's original command. An error (exit 3, `Timed out waiting for the DingTalk QR scan`) means nobody scanned in time; ask whether to try again rather than looping.

If you cannot run commands in the background, ask the user to run `hdu auth login` in their own terminal instead (it shows the QR code there) and to tell you when it is done.

First-time users can also run `hdu setup`, which checks the environment, logs in and installs these skills — it is interactive, so the user must run it themselves.

Never ask for the password or verification code, and never try to scan or confirm on the user's behalf.

## Log out

`hdu auth logout` deletes all saved sessions.
