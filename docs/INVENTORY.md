# core-01 inventory

Phase 0, read-only. Taken 2026-10-29 over the tailnet as `saytou` (member of `docker` and `sudo`,
no passwordless sudo). Nothing was changed on the host. Secrets, `.env` files and `/root` were not read.

## Host
| Fact | Value |
| --- | --- |
| Hardware | **HP Laptop 15-da0xxx**, Intel i7-8550U, 8 threads |
| Arch | **x86_64** (amd64) |
| OS | Debian 13 (trixie), kernel 6.12.74 |
| Tailscale | 1.102.2, `100.100.101.1`, direct on LAN `10.100.102.42` |
| Uptime | 2 days, load ~0.3 |
| Host services | docker, containerd, tailscaled, crowdsec + firewall bouncer, `luma-core` (uvicorn on `0.0.0.0:9000`, `/opt/luma`), bluetooth |

## Storage
- One disk: **NVMe SK hynix BC501 256 GB** (an SSD). `/` is ext4 225 GB, 35 GB used, 180 GB free. 7.9 GB swap partition.
- There is no separate SSD mount. Everything, including Docker, lives on `/`.
- Existing data layout: `/mesh/{certs,configs,data,logs}` (bind mounts for most services), `/opt/stacks/metrics`, `/opt/luma`.
  `/opt/hub` does not exist yet.

## RAM headroom
- 7.7 GiB total, 6.4 GiB used, **~1.3 GiB available**, 239 MiB swap in use.
- The containers add up to only ~1.6 GiB. The biggest consumers are on the host: **dockerd 2.2 GiB RSS** and
  **crowdsec 1.9 GiB RSS**. Both look abnormal and are worth checking before adding containers.
- If those two are brought down to normal, there is plenty of room for the hub's ~400 MB budget. Today the hub would fit, but with little margin.

## Containers
Every image is `linux/amd64`. **No container sets `mem_limit`** (all `Memory=0`). All have restart `unless-stopped` and use the
`services_mesh_net` network.

| Container | Image | Published ports | Mem now | Data |
| --- | --- | --- | --- | --- |
| nginx | nginx:latest | 80, 443 | 8 MiB | `/mesh/configs/nginx.conf`, `/mesh/certs` |
| authelia | authelia/authelia:latest (**v4.39.19**) | - | 36 MiB | `/mesh/configs/authelia`, `/mesh/data/authelia` |
| n8n | n8nio/n8n:latest | **5678 on 0.0.0.0** | 318 MiB | `/mesh/data/n8n` |
| gitea | gitea/gitea:latest | 2222 (ssh) | 160 MiB | `/mesh/data/gitea` |
| woodpecker-server | woodpeckerci/woodpecker-server:v3 | - | 36 MiB | `/mesh/data/woodpecker` |
| woodpecker-agent | woodpeckerci/woodpecker-agent:v3 | - | 25 MiB | docker.sock |
| pihole | pihole/pihole:latest | 53 tcp/udp | 21 MiB | `/mesh/data/pihole` |
| unbound | klutchell/unbound:latest | - | 6 MiB | - |
| redis | redis:alpine | - | 11 MiB | none (ephemeral) |
| code-server | codercom/code-server:latest | - | 51 MiB | `/mesh/data/code-server`, **`/root/system` mounted in** |
| grafana | grafana/grafana:latest | - | 218 MiB | volume `metrics_grafana_data` |
| prometheus | prom/prometheus:latest | - | 98 MiB | volume `metrics_prometheus_data` |
| netdata | netdata/netdata:latest | - | 333 MiB | /proc, /sys, docker.sock |
| mesh-dashboard | services-mesh-dashboard (local build) | - | 47 MiB | docker.sock |
| uptimekuma | louislam/uptime-kuma:latest | - | 151 MiB | `/mesh/data/uptimekuma` |
| syncthing | syncthing/syncthing:latest | 22000, 21027/udp | 47 MiB | `/mesh/data/syncthing` |
| vaultwarden | vaultwarden/server:latest | - | 17 MiB | `/mesh/data/vaultwarden` |

Compose projects: `services` (15 containers, `/root/system/services/docker-compose.yml`, which `saytou` cannot read) and
`metrics` (grafana + prometheus, `/opt/stacks/metrics/docker-compose.yml`).

Other listeners on the host: 22 (sshd), 9000 (luma-core), 127.0.0.1:8080, 127.0.0.1:6060, plus tailscaled.

**Not present on core-01:** Jellyfin (proxied to niflheim `100.100.101.100:8096`), cloudflared, NP Monitor (unless
`mesh-dashboard` is NP Monitor), ntfy, CouchDB.

## nginx sites
One file, `/mesh/configs/nginx.conf` (34 KB, edited Sep 10), plus the stock `conf.d/default.conf`. Port 80 catches `*.mesh.net` and
proxies to the hard-coded `172.19.0.5:3000`. Each 443 site uses `auth_request` against Authelia forward-auth unless noted otherwise.

| Host | Upstream |
| --- | --- |
| auth.mesh.net | authelia:9091 |
| mesh.net | mesh-dashboard:3000 |
| home.mesh.net | (no proxy_pass found) |
| status.mesh.net | uptimekuma:3001 |
| vault.mesh.net | vaultwarden |
| flow / n8n.mesh.net | n8n:5678 |
| pulse / monitor.mesh.net | netdata:19999 |
| resolve / dns.mesh.net | pihole |
| sync.mesh.net | syncthing:8384 |
| dev / code.mesh.net | code-server:8080 |
| source / git.mesh.net | gitea:3000 |
| luma.mesh.net | bifrost `100.100.101.10:8000` |
| media.mesh.net | niflheim :8096 (Jellyfin), no forward-auth |
| request.mesh.net | niflheim :5055, no forward-auth |
| sonarr / radarr / prowlarr / torrent / bazarr / dozzle | niflheim :8989 / 7878 / 9696 / 8082 / 6767 / 8085 |
| metrics.mesh.net | `172.19.0.41:3000` (grafana, hard-coded IP) |
| prom.mesh.net | `172.19.0.40:9090` (prometheus, hard-coded IP) |
| ci.mesh.net | `172.19.0.45:8000` (woodpecker, hard-coded IP) |
| `_` | default |

TLS: one **mkcert** wildcard `*.mesh.net` + `mesh.net`, valid until 2028-11-23. The CA is `mkcert root@core-01`, valid until 2036.

## Authelia
- **v4.39.19**, which meets the >= 4.39 passkey requirement. The image is `:latest`, so it is not pinned.
- `configuration.yml` is small (1 KB). It has a `session` with domain `mesh.net`. I found **no `webauthn` and no `identity_providers.oidc`** section,
  so passkeys and OIDC are not configured yet.

## Netdata
- One standalone agent on core-01. Its node list shows only `core-01`, with no streaming children and no `stream.conf` set.
  The other nodes (bifrost, niflheim, odin) were offline on the tailnet when this was taken.

## Conflicts with the plan
1. **Arch: core-01 is x86_64, not ARM64.** The rules "every image linux/arm64" and "build on `ubuntu-24.04-arm` runners" are
   wrong for this host. Build `linux/amd64`, or multi-arch if a NanoPi is still meant to host it later.
2. **Hardware: an HP laptop with 8 GB, not a NanoPi R5C with 4 GB / Armbian.** The PLAN and CLAUDE.md host description needs updating.
3. **RAM headroom is only ~1.3 GiB**, mostly because dockerd (2.2 GiB) and crowdsec (1.9 GiB) are bloated. Look at those before adding
   hub-web, hub-worker, ntfy, couchdb and livesync-bridge.
4. **No `mem_limit` anywhere.** The hub's own containers will set it, but the existing ones can still starve the box.
5. **No separate SSD mount.** The NVMe is the root disk. Decided: hub data goes in `/mesh/data/hub`, matching the other services.
6. **Authelia has no OIDC provider or WebAuthn configured.** Phase 2 needs a new `identity_providers.oidc` + `webauthn` snippet.
7. **The certs are mkcert, not a proper internal CA.** That works for "fully trusted on every device" only if the mkcert root is installed
   everywhere, iOS included.
8. **`hub.mesh.net` is not in nginx yet.** `mesh.net` currently serves `mesh-dashboard`, which is probably NP Monitor, and `status.mesh.net` serves Uptime Kuma.
   Both are cutover targets.
9. **n8n publishes 5678 on 0.0.0.0**, so the LAN can reach it directly and bypass Authelia.
10. **Hard-coded container IPs** in nginx (172.19.0.5/.40/.41/.45) will break when containers are recreated. Hub snippets should use service names.
11. **Images use `:latest` everywhere.** A rollback guarantee for the hub implies pinning at least its own images.
12. The main compose file is under `/root/system`, which `saytou` can't read. The deploy user needs a decided home (data in `/mesh/data/hub`) and
    docker group access, which `saytou` already has.
