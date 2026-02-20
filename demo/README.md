Demo: unified MCCSS substrate + Edenfield admin

Quick start

- Ensure Docker and Docker Compose v2 are installed.
- From the repository root, run:

```
cd demo
ADMIN_API_TOKEN=demo-token ./run-demo.sh
```

This will build images for `substrate` (the MCCSS backend) and `edenfield-admin`, start them, and tail the backend logs. The admin UI will be available on port 8000 (and admin API on 9321).

Notes
- The demo compose mounts the source directories into containers for fast iteration. For production use, build proper release images and remove the mounts.
- If you prefer not to mount code, edit `docker-compose.demo.yml` to remove the `volumes` entries.
