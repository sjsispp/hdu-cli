# Login

HDU systems use one unified identity login (杭电统一身份认证, `sso.hdu.edu.cn`). hdu saves that session encrypted on the user's machine (macOS Keychain / Windows DPAPI) and silently renews each site's session from it. The user only logs in again when the SSO session itself expires.

## Check

```bash
hdu auth status --json
```

`data.sso` is the SSO session; `data.services.jw` / `data.services.job` show whether each site is usable.

## Log in

Login requires the user to scan a DingTalk QR code, so the user must run it **in their own terminal**:

- First time: `hdu setup` (checks the environment, logs in, installs these skills).
- Later: `hdu auth login` (QR code in the terminal) or `hdu auth login --method browser`.

Tell the user exactly which command to run and wait for them to confirm. Then retry the original command.

Never ask for the password or verification code, and never try to complete the login yourself.

## Log out

`hdu auth logout` deletes all saved sessions.
