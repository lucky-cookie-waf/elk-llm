#!/bin/sh

echo "Running prisma generate..."
npx prisma generate --schema=./prisma/schema.prisma

echo "Waiting for prisma client to settle.."
sleep 1

echo "Starting parser..."
node parser.js