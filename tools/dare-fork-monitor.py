#!/usr/bin/env python3
"""
dare-fork-monitor.py — DARE Method fork/clone monitor
Searches GitHub for unauthorized DARE derivatives and trademarks violations.
Run locally or as GitHub Actions weekly job.

Usage:
  python dare-fork-monitor.py [--json] [--slack-webhook URL]

Requires: GITHUB_TOKEN env var (read:public_repo scope)

License: MIT — DARE Method / Dewtech Technologies
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OFFICIAL_REPO = "dewtech-technologies/dare-method"
OFFICIAL_OWNER = "dewtech-technologies"

# Suspicious name fragments — repositories matching any of these may be
# unauthorized derivatives.
SUSPICIOUS_NAME_PATTERNS = [
    "dare-pro",
    "dare-cloud",
    "dare-enterprise",
    "dare-fork",
    "dare-method-pro",
    "dare-method-cloud",
    "dare-method-fork",
    "dare-method-enterprise",
    "dare-cli-pro",
    "dare-platform",
    "dare-saas",
    "dare-framework-pro",
    "dare-framework-cloud",
]

# Keywords that, when found in a repository description, strongly suggest a
# DARE derivative that might violate the trademark.
DARE_DESCRIPTION_KEYWORDS = [
    "dare method",
    "dare framework",
    "define architecture",
    "dare skill",
    "dare registry",
    "dare agent",
    "dare v3",
    "dare v2",
]

# GitHub Search API base
GITHUB_API_BASE = "https://api.github.com"

# Local history file
HISTORY_FILE = Path.home() / ".dare" / "fork-monitor-history.json"


# ---------------------------------------------------------------------------
# GitHub API helpers
# ---------------------------------------------------------------------------


def _build_headers(token: str | None) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _github_get(path: str, params: dict[str, str] | None, token: str | None) -> tuple[dict[str, Any], dict[str, str]]:
    """Perform a GET request against the GitHub API and return (body, response_headers)."""
    url = GITHUB_API_BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)

    req = urllib.request.Request(url, headers=_build_headers(token))
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode())
            # urllib doesn't give a clean dict; build one from the HTTPMessage
            resp_headers = {k.lower(): v for k, v in resp.headers.items()}
            return body, resp_headers
    except urllib.error.HTTPError as exc:
        body = {}
        try:
            body = json.loads(exc.read().decode())
        except Exception:
            pass
        raise RuntimeError(
            f"GitHub API error {exc.code} on {url}: {body.get('message', exc.reason)}"
        ) from exc


def _check_rate_limit(headers: dict[str, str]) -> None:
    """Warn or pause if rate limit is nearly exhausted."""
    remaining = headers.get("x-ratelimit-remaining")
    reset_ts = headers.get("x-ratelimit-reset")
    if remaining is None:
        return
    remaining = int(remaining)
    if remaining <= 5:
        if reset_ts:
            wait = max(0, int(reset_ts) - int(time.time())) + 2
            print(
                f"[rate-limit] Only {remaining} requests remaining — sleeping {wait}s until reset…",
                file=sys.stderr,
            )
            time.sleep(wait)
        else:
            print(
                f"[rate-limit] Only {remaining} requests remaining — sleeping 60s…",
                file=sys.stderr,
            )
            time.sleep(60)


# ---------------------------------------------------------------------------
# Search logic
# ---------------------------------------------------------------------------


def _search_repos(query: str, token: str | None) -> list[dict[str, Any]]:
    """Return all repositories matching *query* (handles pagination)."""
    results: list[dict[str, Any]] = []
    page = 1
    per_page = 30

    while True:
        params = {
            "q": query,
            "per_page": str(per_page),
            "page": str(page),
            "sort": "updated",
            "order": "desc",
        }
        try:
            data, headers = _github_get("/search/repositories", params, token)
        except RuntimeError as exc:
            print(f"[warn] Search failed for '{query}': {exc}", file=sys.stderr)
            break

        _check_rate_limit(headers)

        items = data.get("items", [])
        results.extend(items)

        if len(items) < per_page:
            break
        page += 1
        # Small delay to be a good citizen
        time.sleep(0.5)

    return results


def _is_official_or_legitimate_fork(repo: dict[str, Any]) -> bool:
    """Return True if the repo is the official repo or an acknowledged fork."""
    full_name: str = repo.get("full_name", "")
    owner: str = repo.get("owner", {}).get("login", "")

    if full_name == OFFICIAL_REPO:
        return True
    if owner == OFFICIAL_OWNER:
        return True
    # GitHub marks forks; forks of the official repo are MIT-legitimate
    if repo.get("fork") and repo.get("parent", {}).get("full_name") == OFFICIAL_REPO:
        return True
    return False


def _score_suspicion(repo: dict[str, Any]) -> int:
    """Return a suspicion score (0 = clean, higher = more suspicious)."""
    score = 0
    name: str = repo.get("name", "").lower()
    description: str = (repo.get("description") or "").lower()
    full_name: str = repo.get("full_name", "").lower()

    for pattern in SUSPICIOUS_NAME_PATTERNS:
        if pattern in name or pattern in full_name:
            score += 3

    for kw in DARE_DESCRIPTION_KEYWORDS:
        if kw in description:
            score += 2

    # Extra suspicion if they use "dare" prominently in the name AND description
    if "dare" in name and any(kw in description for kw in DARE_DESCRIPTION_KEYWORDS):
        score += 2

    return score


def find_suspicious_repos(token: str | None) -> list[dict[str, Any]]:
    """Run all search queries and return de-duplicated suspicious repos."""
    queries = [
        "dare method in:name,description",
        "dare-method in:name",
        "dare framework development methodology in:description",
    ]

    seen: set[str] = set()
    suspicious: list[dict[str, Any]] = []

    for q in queries:
        repos = _search_repos(q, token)
        for repo in repos:
            full_name: str = repo.get("full_name", "")
            if full_name in seen:
                continue
            seen.add(full_name)

            if _is_official_or_legitimate_fork(repo):
                continue

            score = _score_suspicion(repo)
            if score > 0:
                repo["_suspicion_score"] = score
                suspicious.append(repo)

    # Sort by score descending
    suspicious.sort(key=lambda r: r.get("_suspicion_score", 0), reverse=True)
    return suspicious


# ---------------------------------------------------------------------------
# History management
# ---------------------------------------------------------------------------


def _load_history() -> dict[str, Any]:
    if HISTORY_FILE.exists():
        try:
            return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_history(history: dict[str, Any]) -> None:
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")


def _update_history(suspicious: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Compare against history, return (new_findings, all_current)."""
    history = _load_history()
    known_repos: dict[str, Any] = history.get("repos", {})

    new_findings = []
    now = datetime.now(timezone.utc).isoformat()

    for repo in suspicious:
        full_name = repo["full_name"]
        if full_name not in known_repos:
            new_findings.append(repo)
            known_repos[full_name] = {
                "first_seen": now,
                "suspicion_score": repo.get("_suspicion_score", 0),
                "url": repo.get("html_url", ""),
                "description": repo.get("description", ""),
            }
        else:
            # Update score in case it changed
            known_repos[full_name]["suspicion_score"] = repo.get("_suspicion_score", 0)
            known_repos[full_name]["last_seen"] = now

    history["repos"] = known_repos
    history["last_run"] = now
    _save_history(history)

    return new_findings, suspicious


# ---------------------------------------------------------------------------
# Output formatters
# ---------------------------------------------------------------------------


def _ascii_table(suspicious: list[dict[str, Any]], new_findings: list[dict[str, Any]]) -> str:
    new_names = {r["full_name"] for r in new_findings}
    sep = "+" + "-" * 45 + "+" + "-" * 10 + "+" + "-" * 6 + "+" + "-" * 8 + "+"
    header = f"| {'Repository':<43} | {'Stars':>8} | {'Score':>4} | {'Status':>6} |"

    lines = [
        "",
        "  DARE Fork Monitor — Suspicious Repositories",
        "  " + "=" * 60,
        sep,
        header,
        sep,
    ]

    for repo in suspicious:
        full_name = repo.get("full_name", "")[:43]
        stars = repo.get("stargazers_count", 0)
        score = repo.get("_suspicion_score", 0)
        status = "NEW" if repo["full_name"] in new_names else "known"
        lines.append(f"| {full_name:<43} | {stars:>8} | {score:>4} | {status:>6} |")

    lines.append(sep)
    lines.append(f"  Total suspicious: {len(suspicious)}  |  New this run: {len(new_findings)}")
    lines.append("")
    return "\n".join(lines)


def _json_output(suspicious: list[dict[str, Any]], new_findings: list[dict[str, Any]]) -> str:
    new_names = {r["full_name"] for r in new_findings}
    payload = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "total_suspicious": len(suspicious),
        "new_findings": len(new_findings),
        "repos": [
            {
                "full_name": r.get("full_name"),
                "url": r.get("html_url"),
                "description": r.get("description"),
                "stars": r.get("stargazers_count", 0),
                "suspicion_score": r.get("_suspicion_score", 0),
                "is_new": r["full_name"] in new_names,
            }
            for r in suspicious
        ],
    }
    return json.dumps(payload, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Slack notification
# ---------------------------------------------------------------------------


def _send_slack(webhook_url: str, suspicious: list[dict[str, Any]], new_findings: list[dict[str, Any]]) -> None:
    if not new_findings:
        return

    repo_lines = "\n".join(
        f"• <{r.get('html_url')}|{r.get('full_name')}> (score {r.get('_suspicion_score', 0)})"
        for r in new_findings[:10]
    )
    if len(new_findings) > 10:
        repo_lines += f"\n…and {len(new_findings) - 10} more"

    payload = {
        "text": f":warning: *DARE Fork Monitor* — {len(new_findings)} new suspicious repo(s) found",
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": (
                        f":warning: *DARE Fork Monitor*\n"
                        f"Found *{len(new_findings)} new* suspicious repositories "
                        f"({len(suspicious)} total).\n\n"
                        f"{repo_lines}"
                    ),
                },
            }
        ],
    }

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        webhook_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10):
            pass
        print("[slack] Alert sent.", file=sys.stderr)
    except Exception as exc:
        print(f"[slack] Failed to send alert: {exc}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Offline fallback
# ---------------------------------------------------------------------------


def _offline_report(as_json: bool) -> int:
    """Report from cached history when network is unavailable."""
    history = _load_history()
    repos = history.get("repos", {})
    last_run = history.get("last_run", "never")

    if as_json:
        print(json.dumps({"offline": True, "last_run": last_run, "cached_repos": len(repos)}, indent=2))
    else:
        print(f"\n  [offline] Using cached history from last run: {last_run}")
        print(f"  Cached suspicious repos: {len(repos)}")
        for full_name, meta in list(repos.items())[:20]:
            print(f"  • {full_name} (first seen {meta.get('first_seen', '?')}, score {meta.get('suspicion_score', '?')})")
        print()

    return 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Monitor GitHub for unauthorized DARE Method derivatives.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="as_json",
        help="Output results as JSON instead of ASCII table",
    )
    parser.add_argument(
        "--slack-webhook",
        metavar="URL",
        help="Slack incoming webhook URL to send alerts when new repos are found",
    )
    args = parser.parse_args()

    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print(
            "[warn] GITHUB_TOKEN not set — unauthenticated requests are heavily rate-limited.",
            file=sys.stderr,
        )

    # Try online search; fall back to offline cache on network errors
    try:
        suspicious = find_suspicious_repos(token)
    except OSError as exc:
        print(f"[error] Network error: {exc} — falling back to offline cache.", file=sys.stderr)
        return _offline_report(args.as_json)

    new_findings, all_suspicious = _update_history(suspicious)

    if args.as_json:
        print(_json_output(all_suspicious, new_findings))
    else:
        print(_ascii_table(all_suspicious, new_findings))

    if args.slack_webhook and new_findings:
        _send_slack(args.slack_webhook, all_suspicious, new_findings)

    # Exit 1 if there are any suspicious repos (new or known), so CI can alert
    return 1 if all_suspicious else 0


if __name__ == "__main__":
    sys.exit(main())
