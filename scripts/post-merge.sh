#!/bin/bash
set -e
pnpm install --frozen-lockfile
# BHRU schema is owned by reviewed SQL migrations, never schema push.
# Operators apply migrations explicitly after building the API.
echo "Dependencies ready. If SQL migrations changed, explicitly run pnpm build:bhru then pnpm db:migrate on the intended Development database."
