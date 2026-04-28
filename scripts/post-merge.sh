#!/bin/bash
set -e

npm install

echo "Checking migration metadata integrity..."
npx drizzle-kit check

npm run db:migrate
