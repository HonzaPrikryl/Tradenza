#!/usr/bin/env sh
# One-time git hook setup (husky v9 + lint-staged).
# Run once after `npm install`:  sh scripts/setup-hooks.sh
set -e

# Initialise husky (creates .husky/_ and the git hooksPath).
npx husky init

# pre-commit: format + lint only the staged files.
printf 'npx lint-staged\n' > .husky/pre-commit

# pre-push: full type-check before code leaves the machine.
printf 'npm run typecheck\n' > .husky/pre-push

echo "✓ Installed .husky/pre-commit (lint-staged) and .husky/pre-push (typecheck)"
