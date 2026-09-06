# Debian backup agent

This runs independently on your Debian laptop. It creates an encrypted, full SQL dump from Turso, restores it into a temporary SQLite database, requires `PRAGMA integrity_check` to return `ok`, then keeps the encrypted artifact and checksum locally. A failed dump never removes an earlier backup.

## One-time setup

Install the dependencies:

```sh
sudo apt update
sudo apt install age curl sqlite3
```

Create a dedicated unprivileged user and protected destination:

```sh
sudo useradd --system --create-home --shell /usr/sbin/nologin papertrail-backup
sudo install -d -o papertrail-backup -g papertrail-backup -m 700 /var/lib/papertrail-backups
```

Create an age identity outside the repository, keep its private key offline, and record its public recipient:

```sh
age-keygen -o ~/.config/papertrail-backup.agekey
grep '^# public key:' ~/.config/papertrail-backup.agekey
```

Create `/etc/papertrail-backup.env`, owned by root and mode `600`:

```sh
TURSO_DATABASE_URL=libsql://your-database-your-org.turso.io
TURSO_AUTH_TOKEN=use-a-dedicated-backup-token
BACKUP_DIR=/var/lib/papertrail-backups
BACKUP_ENCRYPTION_RECIPIENT=age1replace-with-your-public-recipient
BACKUP_PREFIX=papertrail
BACKUP_RETENTION_HOURS=48
BACKUP_DAILY_DAYS=30
BACKUP_MONTHLY_MONTHS=12
```

Use a separate Turso token for this machine. Do not place the token or the age private key in Git, Vercel, or the application environment.

Install the systemd files, then enable the timer:

```sh
sudo cp ops/backups/systemd/papertrail-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now papertrail-backup.timer
systemctl list-timers papertrail-backup.timer
```

Test one backup first:

```sh
sudo systemctl start papertrail-backup.service
sudo journalctl -u papertrail-backup.service -n 50 --no-pager
```

## Retention

The timer runs every 15 minutes. Rotation retains every backup for 48 hours, the latest verified backup from each day for 30 days, and the latest verified backup from each month for 12 months.

## Recovery

Never overwrite the live database. Decrypt and inspect a backup on an isolated machine, then create a new Turso database from the recovered SQL dump and change Vercel only after validation:

```sh
age --decrypt -i ~/.config/papertrail-backup.agekey backup.sql.gz.age | gunzip > recovered.sql
sqlite3 recovered.sqlite < recovered.sql
sqlite3 recovered.sqlite 'PRAGMA integrity_check;'
turso db create papertrail-recovered --from-dump recovered.sql
```

Keep the old database until login, time history, and migration checks have passed against the replacement.
