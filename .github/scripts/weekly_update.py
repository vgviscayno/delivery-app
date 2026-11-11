"""Draft the weekly client update as an issue labelled weekly-update.

The top half is the draft to send the client; the bottom half is internal
pacing. Run with --dry-run to print the body instead of opening the issue.

Each milestone carries two dates. The GitHub due date is the internal one, the
date to aim the work at. The client date, written as "Client date: YYYY-MM-DD"
in the milestone description, is what the client was told, about 10 days
later. The client draft shows only client dates. Milestones with no due date
(Polish) are left out of both tables.
"""

import json
import os
import re
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone

START = date(2026, 9, 26)
BREAK = (date(2026, 12, 21), date(2027, 1, 3))  # inclusive

CLIENT_DATE_RE = re.compile(r"client date:\s*(\d{4}-\d{2}-\d{2})", re.IGNORECASE)


def gh(*args):
    out = subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def parse_ts(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def working_days(start, end):
    """Days from start up to end, not counting the holiday break."""
    return [start + timedelta(days=d) for d in range((end - start).days)
            if not BREAK[0] <= start + timedelta(days=d) <= BREAK[1]]


def halfway(start, end):
    days = working_days(start, end)
    return days[len(days) // 2] if days else end


def fmt(d):
    return d.strftime("%d %b %Y") if d else "-"


def main():
    dry_run = "--dry-run" in sys.argv
    today = date.today()
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    if today < START:
        print("Work hasn't started yet; skipping.")
        return
    week_no = (today - START).days // 7 + 1

    title = f"Weekly update: week {week_no} ({today.isoformat()})"
    existing = gh("issue", "list", "--label", "weekly-update", "--state", "all",
                  "--search", f"in:title \"week {week_no} \"", "--json", "title")
    if any(i["title"].startswith(f"Weekly update: week {week_no} ") for i in existing):
        print(f"Week {week_no} update already exists; skipping.")
        return

    issues = gh("issue", "list", "--state", "closed", "--limit", "300",
                "--json", "title,closedAt,milestone,stateReason")
    closed_this_week = [i for i in issues
                        if i["milestone"] and i["stateReason"] != "NOT_PLANNED"
                        and i["closedAt"] and parse_ts(i["closedAt"]) >= week_ago]

    milestones = []
    for m in gh("api", "repos/{owner}/{repo}/milestones?state=all&sort=due_on&direction=asc"):
        if not m["due_on"]:
            continue
        found = CLIENT_DATE_RE.search(m["description"] or "")
        milestones.append({
            "title": m["title"],
            "due": date.fromisoformat(m["due_on"][:10]),
            "client": date.fromisoformat(found.group(1)) if found else None,
            "done": m["closed_issues"],
            "open": m["open_issues"],
        })

    # --- client draft ---
    lines = [f"Draft for the client, week {week_no}. Edit, send, then close this issue.", "",
             "## For the client", "", "**Done this week**", ""]
    lines += [f"- {i['title']}" for i in closed_this_week] or ["- (nothing closed this week)"]
    lines += ["", "**Milestones**", "", "| Milestone | Expected | Progress | Status |", "|---|---|---|---|"]
    for m in milestones:
        total = m["done"] + m["open"]
        if total and not m["open"]:
            status = "Done"
        elif m["client"] and m["client"] < today:
            status = "**Overdue**"
        elif m["client"] and (m["client"] - today).days <= 7:
            status = "Due this week"
        else:
            status = "In progress" if m["done"] else "Not started"
        lines.append(f"| {m['title']} | {fmt(m['client'])} | {m['done']}/{total} | {status} |")

    # --- internal pacing ---
    lines += ["", "---", "", "## Internal, do not send", ""]
    window_start = START
    for m in milestones:
        start, window_start = window_start, m["due"]
        total = m["done"] + m["open"]
        if not m["open"] or today < start:
            continue
        mid = halfway(start, m["due"])
        head = f"- **{m['title']}**: {m['open']} of {total} open, aim for {fmt(m['due'])}"
        if m["client"] and today > m["client"]:
            lines.append(f"{head}. **Past the client date ({fmt(m['client'])}). Tell the client.**")
        elif today > m["due"]:
            left = (m["client"] - today).days if m["client"] else 0
            lines.append(f"{head}. Past the aim date, {left} days of buffer left before the client date.")
        elif today >= mid and m["open"] * 2 > total:
            lines.append(f"{head}. **Halfway check failed: more than half still open after {fmt(mid)}."
                         " Decide now whether to tell the client.**")
        else:
            lines.append(f"{head}. Halfway point {fmt(mid)}.")
        if not m["client"]:
            lines.append(f"  - No `Client date:` in the {m['title']} description.")

    body = "\n".join(lines)
    if dry_run:
        print(title, body, sep="\n\n")
        return
    subprocess.run(["gh", "issue", "create", "--title", title, "--label", "weekly-update",
                    "--assignee", os.environ.get("ASSIGNEE", "@me"), "--body", body], check=True)


if __name__ == "__main__":
    main()
