# Vault sync: Obsidian on YPC and iPhone through CouchDB

The vault syncs with the free **Self-hosted LiveSync** plugin through CouchDB on core-01
(`couch.mesh.net`). Every device keeps a full copy and syncs within seconds while online.
Everything stays on the tailnet: Tailscale must be on for a device to sync.

## 1. Once, on core-01 (before the deploy that adds CouchDB)

Add to `/mesh/data/hub/.env`, with a long random password (e.g. `openssl rand -base64 24`):

```bash
COUCHDB_USER=obsidian
COUCHDB_PASSWORD=<long random password>
```

After the deploy, add `deploy/nginx/couch.mesh.net.conf` to `/mesh/configs/nginx.conf`
(test with `docker exec nginx nginx -t`, then `docker exec nginx nginx -s reload`), and check
that `couch.mesh.net` resolves (`nslookup couch.mesh.net` from YPC; add it in Pi-hole if not).

`https://couch.mesh.net/_utils/` then shows CouchDB's own admin page (Fauxton), behind that login.

## 2. YPC first (it has the notes)

1. Obsidian → Settings → Community plugins → Browse → **Self-hosted LiveSync** → Install → Enable.
2. Its setup wizard → **Manual setup** (not the setup URI):
   - Remote type **CouchDB**, URI `https://couch.mesh.net`
   - Username / password: the two values from `.env`
   - Database name: `obsidian`
   - **End-to-end encryption: off** (the hub reads the notes for search; the data never leaves core-01)
3. **Test** → then **Check database configuration** and press **Fix** on anything it flags.
4. Sync mode **LiveSync**. Let the first upload finish (the status bar shows progress).

## 3. iPhone

1. The iPhone must fully trust core-01's mkcert root (Settings → General → About →
   **Certificate Trust Settings** → `mkcert root@core-01` on) and have Tailscale on.
2. Obsidian → create a new, empty vault with the **same name** as on YPC.
3. Install and enable **Self-hosted LiveSync**, same settings as above.
4. When it asks, choose to **fetch everything from the remote**: the iPhone downloads the vault
   instead of uploading an empty one.

## If something goes wrong

- *Test fails with a certificate error:* the device doesn't trust the mkcert root.
- *401:* wrong username or password.
- *Can't connect:* Tailscale is off, `couch.mesh.net` doesn't resolve, or the nginx block is missing.
- *Conflicts:* LiveSync keeps both versions and marks them; open the note and pick one.
