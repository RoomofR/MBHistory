# Markboard History
A took that fetches marketboard sales from [universalis](https://universalis.app/) history api. It then keep tracks of it all in the embedded 

## Installation
To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

Then it can be ran using **systemd timers**:
1. Create `/etc/systemd/system/bun-job.service`:
```ini
[Unit]
Description=Run Bun job (index.ts)

[Service]
Type=oneshot
ExecStart=/root/.bun/bin/bun run /root/web/index.ts
WorkingDirectory=/root/web
```
2. Create `/etc/systemd/system/bun-job.timer`:
```ini
[Unit]
Description=Run Bun job every hour

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```
3. Enable and start the timer
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bun-job.timer
```
4. Check status
```bash
#Check if timer is active and future/precious runs
systemctl list-timers | grep bun-job

#get log of previous runs
journalctl -u bun-job.service
journalctl -u bun-job.service --since "1 hour ago"
```

## Configs and Setup
You can now list the whitelisted items to keep track of in `whitelist.ini`\
Example:
```ini
#crystals
8
9
10
11
12

#clusters

#--- Materia ---
#DoL
41762 #gath XI
41763 #precep XI
41764 #gp XI

41775 #gath XII
41776 #precep XII
41777 #gp XII

#DoH
41765 #crafts XI
41766 #cp XI
41767 #control XI

41778 #crafts XII
41779 #cp XII
41780 #control XII

#yan horn
46829
```