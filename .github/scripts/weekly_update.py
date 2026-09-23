"""Draft the weekly client update as an issue labelled weekly-update.

The top half is the draft to send the client; the bottom half is internal
pace tracking against the estimate in .scratch/client-estimate/estimate.html.
Run with --dry-run to print the body instead of opening the issue.
"""

import json
import os
import re
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone

START = date(2026, 9, 26)
BREAK = (date(2026, 12, 21), date(2027, 1, 3))  # inclusive
BUILD_DEADLINE = date(2027, 5, 22)  # committed go-live early June minus 2 weeks client testing

TARGET_HOURS_PER_WEEK = 12
TARGET_HOURS_PER_POINT = 2.5 * 1.15  # incl. 15% for fixes and deploying
LATE_HOURS_PER_POINT = 4

# Sizes from the ticket survey on 2026-09-24: S=1, M=2, L=3, XL=5.
POINTS = {
    55: 5, 56: 3, 57: 2, 58: 2, 59: 2, 60: 2, 61: 3, 62: 2, 63: 1, 64: 3,
    65: 3, 66: 2, 67: 2, 68: 3, 69: 3, 70: 3, 71: 3, 72: 5, 73: 5, 74: 2,
    75: 3, 76: 3, 77: 3, 78: 3, 79: 5, 80: 3, 81: 3, 82: 3, 83: 1, 84: 1,
    85: 2, 86: 3,
}
TOTAL_POINTS = sum(POINTS.values())

HOURS_RE = re.compile(r"^\s*hours:\s*([0-9]+(?:\.[0-9]+)?)", re.IGNORECASE | re.MULTILINE)


def gh(*args):
    out = subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def working_weeks(start, end):
    """Weeks between start and end, not counting the holiday break."""
    if end <= start:
        return 0.0
    days = (end - start).days
    overlap = (min(end, BREAK[1] + timedelta(days=1)) - max(start, BREAK[0])).days
    return (days - max(overlap, 0)) / 7


def parse_ts(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def main():
    dry_run = "--dry-run" in sys.argv
    today = date.today()
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
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

    issues = gh("issue", "list", "--state", "all", "--limit", "300",
                "--json", "number,title,state,closedAt,milestone,labels")
    tickets = [i for i in issues if i["number"] in POINTS]
    closed = [i for i in tickets if i["state"] == "CLOSED"]
    closed_this_week = [i for i in closed if i["closedAt"] and parse_ts(i["closedAt"]) >= week_ago]

    hours_total = hours_week = 0.0
    points_with_hours = 0
    for i in closed:
        view = gh("issue", "view", str(i["number"]), "--json", "body,comments")
        entries = [(view["body"] or "", None)] + [(c["body"], c["createdAt"]) for c in view["comments"]]
        logged = False
        for body, created in entries:
            for h in HOURS_RE.findall(body):
                logged = True
                hours_total += float(h)
                if created and parse_ts(created) >= week_ago:
                    hours_week += float(h)
        if logged:
            points_with_hours += POINTS[i["number"]]
    needs_hours = [i for i in closed if any(l["name"] == "needs-hours" for l in i["labels"])]

    milestones = gh("api", "repos/{owner}/{repo}/milestones?state=all&sort=due_on&direction=asc")

    # --- client draft ---
    lines = [f"Draft for the client, week {week_no}. Edit, send, then close this issue.", "",
             "## For the client", "", "**Done this week**", ""]
    lines += [f"- {i['title']}" for i in closed_this_week] or ["- (nothing closed this week)"]
    lines += ["", "**Milestones**", "", "| Milestone | Expected | Progress | Status |", "|---|---|---|---|"]
    for m in milestones:
        due = date.fromisoformat(m["due_on"][:10]) if m["due_on"] else None
        done, total = m["closed_issues"], m["open_issues"] + m["closed_issues"]
        if total and done == total:
            status = "Done"
        elif due and due < today:
            status = "**Overdue**"
        elif due and (due - today).days <= 7:
            status = "Due this week"
        else:
            status = "On track" if done else "Not started"
        lines.append(f"| {m['title']} | {due.strftime('%d %b %Y') if due else '-'} | {done}/{total} | {status} |")

    # --- internal pace ---
    done_points = sum(POINTS[i["number"]] for i in closed)
    weeks = working_weeks(START, today)
    target_points = min(TOTAL_POINTS, weeks * TARGET_HOURS_PER_WEEK / TARGET_HOURS_PER_POINT)
    committed_points = min(TOTAL_POINTS, weeks * TOTAL_POINTS / working_weeks(START, BUILD_DEADLINE))
    if done_points >= target_points:
        verdict = "On or ahead of the target pace (late March go-live)."
    elif done_points >= committed_points:
        verdict = "Behind target, but on pace for the committed date (early June)."
    else:
        verdict = "**Behind the committed pace. Raise it with the client now.**"

    lines += ["", "---", "", "## Internal, do not send", "",
              f"- Points done: **{done_points}/{TOTAL_POINTS}**",
              f"- Target pace expects: {target_points:.1f} · committed pace expects: {committed_points:.1f}",
              f"- {verdict}",
              f"- Hours logged this week: {hours_week:g} · total: {hours_total:g}"]
    if points_with_hours:
        per_point = hours_total / points_with_hours
        lines.append(f"- Measured: {per_point:.2f} h/point (plan: 2.5 likely, {LATE_HOURS_PER_POINT} late)")
    if needs_hours:
        lines.append("- Missing hours: " + ", ".join(f"#{i['number']}" for i in needs_hours))

    body = "\n".join(lines)
    if dry_run:
        print(title, body, sep="\n\n")
        return
    subprocess.run(["gh", "issue", "create", "--title", title, "--label", "weekly-update",
                    "--assignee", os.environ.get("ASSIGNEE", "@me"), "--body", body], check=True)


if __name__ == "__main__":
    main()
