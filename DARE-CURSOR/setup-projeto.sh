#!/bin/bash

# Script de Setup Rápido do Sistema DARE
# Este script copia automaticamente todos os arquivos necessários para seu projeto

set -e

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar se o diretório de destino foi fornecido
if [ -z "$1" ]; then
    echo -e "${RED}❌ Erro: Você deve fornecer o caminho do projeto de destino${NC}"
    echo "Uso: ./setup-projeto.sh /caminho/para/seu/projeto"
    exit 1
fi

DEST_PROJECT="$1"

# Verificar se o diretório de destino existe
if [ ! -d "$DEST_PROJECT" ]; then
    echo -e "${RED}❌ Erro: O diretório '$DEST_PROJECT' não existe${NC}"
    exit 1
fi

echo -e "${BLUE}🚀 Iniciando setup do Sistema DARE em: $DEST_PROJECT${NC}"

# Copiar .cursor
echo -e "${BLUE}📋 Copiando pasta .cursor...${NC}"
cp -r .cursor "$DEST_PROJECT/"
echo -e "${GREEN}✓ Pasta .cursor copiada${NC}"

# Copiar .cursorrules
echo -e "${BLUE}📋 Copiando .cursorrules...${NC}"
cp .cursorrules "$DEST_PROJECT/"
echo -e "${GREEN}✓ Arquivo .cursorrules copiado${NC}"

# Criar diretório DARE se não existir
if [ ! -d "$DEST_PROJECT/DARE" ]; then
    echo -e "${BLUE}📋 Criando diretório DARE...${NC}"
    mkdir -p "$DEST_PROJECT/DARE/EXECUTION"
    echo -e "${GREEN}✓ Diretório DARE criado${NC}"
fi

# Copiar templates
echo -e "${BLUE}📋 Copiando templates...${NC}"
cp -r templates "$DEST_PROJECT/
echo -e "${GREEN}✓ Templates copiados${NC}"

# Copiar exemplos
echo -e "${BLUE}📋 Copiando exemplos...${NC}"
cp -r examples "$DEST_PROJECT/"
echo -e "${GREEN}✓ Exemplos copiados${NC}"

# Criar .gitignore entry para DARE (opcional)
if [ -f "$DEST_PROJECT/.gitignore" ]; then
    if ! grep -q "DARE/" "$DEST_PROJECT/.gitignore"; then
        echo "" >> "$DEST_PROJECT/.gitignore"
        echo "# DARE System" >> "$DEST_PROJECT/.gitignore"
        echo "DARE/EXECUTION/*.md" >> "$DEST_PROJECT/.gitignore"
        echo -e "${GREEN}✓ Adicionado DARE/ ao .gitignore${NC}"
    fi
fi

echo -e "${GREEN}✅ Setup concluído com sucesso!${NC}"
echo ""
echo -e "${BLUE}Próximos passos:${NC}"
echo "1. Abra a pasta do projeto no Cursor: File → Open Folder → $DEST_PROJECT"
echo "2. Abra o Composer: Ctrl/Cmd + I"
echo "3. Digite / para ver os comandos disponíveis"
echo "4. Comece com: /generate-design \"Sua ideia aqui\""
echo ""
echo -e "${BLUE}Para mais informações, leia: CONFIGURACAO-CURSOR.md${NC}"
