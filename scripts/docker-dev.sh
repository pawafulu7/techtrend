#!/bin/bash
# Docker環境の起動・停止スクリプト

case "$1" in
  start)
    docker-compose up -d
    echo "Waiting for services to be ready..."
    sleep 5
    echo "Services started successfully"
    ;;
  stop)
    docker-compose down
    echo "Services stopped"
    ;;
  restart)
    docker-compose restart
    echo "Services restarted"
    ;;
  logs)
    docker-compose logs -f
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|logs}"
    exit 1
    ;;
esac