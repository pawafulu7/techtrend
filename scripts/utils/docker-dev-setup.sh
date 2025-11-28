#!/bin/bash

# Docker Development Environment Setup Script
# This script sets up the complete Docker development environment for TechTrend

set -euo pipefail  # Exit on error, undefined var, and fail on pipe errors

echo "========================================="
echo "TechTrend Docker Development Setup"
echo "========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose (v2) is available
if ! docker compose version >/dev/null 2>&1; then
    print_error "Docker Compose v2 is not available. Please install/enable Docker Compose (plugin)."
    exit 1
fi

print_success "Docker and Docker Compose are installed"
echo ""

# Step 1: Create Docker network if it doesn't exist
print_info "Creating Docker network..."
docker network create techtrend_network 2>/dev/null || {
    print_info "Network 'techtrend_network' already exists"
}
print_success "Docker network ready"
echo ""

# Step 2: Start PostgreSQL and Redis services
print_info "Starting PostgreSQL and Redis services..."
docker compose -f docker-compose.dev.yml up -d
print_success "Database services started"
echo ""

# Step 3: Wait for services to be healthy
print_info "Waiting for services to be healthy..."
attempts=0
max_attempts=30

while [ $attempts -lt $max_attempts ]; do
    if docker compose -f docker-compose.dev.yml ps | grep -q "healthy"; then
        print_success "Services are healthy"
        break
    fi
    attempts=$((attempts + 1))
    echo -n "."
    sleep 2
done

if [ $attempts -eq $max_attempts ]; then
    print_error "Services failed to become healthy in time"
    exit 1
fi
echo ""

# Step 4: Build application Docker image
print_info "Building application Docker image..."
docker compose -f docker-compose.app.yml build
print_success "Application image built"
echo ""

# Step 5: Install dependencies in container
print_info "Installing Node.js dependencies..."
docker compose -f docker-compose.app.yml run --rm app npm ci
print_success "Dependencies installed"
echo ""

# Step 6: Generate Prisma Client
print_info "Generating Prisma Client..."
docker compose -f docker-compose.app.yml run --rm app npx prisma generate
print_success "Prisma Client generated"
echo ""

# Step 7: Run database migrations
print_info "Running database migrations..."
docker compose -f docker-compose.app.yml run --rm app npx prisma migrate deploy || {
    print_info "No pending migrations or migrations already applied"
}
print_success "Database migrations complete"
echo ""

# Step 8: Create .env file from .env.docker if .env doesn't exist
if [ ! -f .env ]; then
    print_info "Creating .env file from .env.docker template..."
    cp .env.docker .env
    print_info "Please update .env file with your actual API keys and secrets"
else
    print_info ".env file already exists, skipping creation"
fi
echo ""

# Final message
echo "========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Update .env file with your actual API keys and secrets"
echo "2. Run 'npm run docker:dev' to start the development server"
echo "3. Access the application at http://localhost:3001"
echo ""
echo "Useful commands:"
echo "  npm run docker:dev     - Start development server"
echo "  npm run docker:build   - Build production bundle"
echo "  npm run docker:test    - Run tests"
echo "  npm run docker:lint    - Run linter"
echo "  npm run docker:bash    - Access container shell"
echo "  npm run docker:logs    - View application logs"
echo "  npm run docker:clean   - Remove all containers and volumes"
echo ""
print_success "Happy coding!"