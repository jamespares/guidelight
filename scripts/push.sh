#!/usr/bin/env bash
# Push via SSH — HTTPS to github.com often times out from mainland China.
set -euo pipefail
cd "$(dirname "$0")/.."
branch="${1:-$(git branch --show-current)}"
remote="${GIT_PUSH_REMOTE:-git@github.com:jamespares/guidelight.git}"
echo "Pushing ${branch} to ${remote} (SSH)…"
git push "$remote" "$branch"
