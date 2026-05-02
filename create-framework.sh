#!/bin/bash
set -e

echo "🚀 Criando estrutura DARE Framework..."

# ============================================================
# ESTRUTURA DE DIRETÓRIOS
# ============================================================
mkdir -p packages/cli/src/bin
mkdir -p packages/cli/src/commands
mkdir -p packages/cli/src/utils
mkdir -p packages/cli/src/dag-runner
mkdir -p packages/mcp-server/src/bin
mkdir -p packages/mcp-server/src/tools
mkdir -p packages/graphrag/src
mkdir -p packages/core/src
mkdir -p templates/backend/rust-axum/src
mkdir -p templates/backend/node-nestjs/src
mkdir -p templates/backend/python-fastapi/app
mkdir -p templates/backend/php-laravel/app/Http/Controllers
mkdir -p templates/frontend/react/src/components
mkdir -p templates/frontend/vue/src/components
mkdir -p templates/shared

echo "✓ Diretórios criados"

