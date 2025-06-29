#!/usr/bin/env bash

# bytebot Docker helper
# -------------------------------------------------
# Wraps the long docker-compose commands used during
# development and deployment so you don't have to
# remember them.
#
# Usage:
#   ./docker-helper.sh dev        # dev stack w/ hot reload & timestamped logs
#   ./docker-helper.sh build      # build images (prod)
#   ./docker-helper.sh start      # start prod stack in background
#   ./docker-helper.sh stop       # stop & remove containers (prod)
#   ./docker-helper.sh logs       # follow logs from running stack
#   ./docker-helper.sh <cmd> ...  # pass extra args to docker-compose
# -------------------------------------------------

set -euo pipefail

COMPOSE_BASE="infrastructure/docker/docker-compose.yml"
COMPOSE_DEV="infrastructure/docker/docker-compose.dev.yml"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 {dev|build|start|stop|logs} [additional docker-compose args]"
  exit 1
fi

# First positional arg is the action; the rest are forwarded to docker-compose
ACTION=$1
shift || true

# Helper: ensure timestamps in logs if 'ts' (moreutils) is installed
pipe_ts() {
  if command -v ts >/dev/null 2>&1; then
    ts '[%Y-%m-%d %H:%M:%S]'
  else
    cat
  fi
}

case "$ACTION" in
  dev)
    # Start full dev stack with hot-reload and log timestamps
    docker-compose -f "$COMPOSE_BASE" -f "$COMPOSE_DEV" up --build "$@" 2>&1 \
      | pipe_ts \
      | tee "docker-logs-$(date +%Y%m%d_%H%M%S).txt"
    ;;
  build)
    docker-compose -f "$COMPOSE_BASE" build "$@"
    ;;
  start)
    docker-compose -f "$COMPOSE_BASE" up -d "$@"
    ;;
  stop)
    docker-compose -f "$COMPOSE_BASE" down "$@"
    ;;
  logs)
    docker-compose -f "$COMPOSE_BASE" logs -f "$@"
    ;;
  *)
    echo "Unknown action: $ACTION"
    echo "Valid actions: dev, build, start, stop, logs"
    exit 1
    ;;
esac 