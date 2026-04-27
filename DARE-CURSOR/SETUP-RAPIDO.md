# Setup Rápido - Sistema DARE no Cursor

Se você quer começar rapidinho, siga este guia de 5 minutos.

## ⚡ Opção 1: Setup Automático (Recomendado)

### No Windows (PowerShell ou CMD):
```bash
cd C:\projetos-dewtech\fermio-plataform\produtividade-assistida-ia\DARE-SYSTEM
setup-projeto.bat C:\caminho\para\seu\projeto
```

### No macOS/Linux (Terminal):
```bash
cd ~/projetos-dewtech/fermio-plataform/produtividade-assistida-ia/DARE-SYSTEM
chmod +x setup-projeto.sh
./setup-projeto.sh /caminho/para/seu/projeto
```

**Pronto!** Os arquivos foram copiados automaticamente para seu projeto.

---

## 📋 Opção 2: Setup Manual

Se o script não funcionar, copie manualmente:

1. **Copie a pasta `.cursor`:**
   - De: `DARE-SYSTEM/.cursor`
   - Para: `seu-projeto/.cursor`

2. **Copie o arquivo `.cursorrules`:**
   - De: `DARE-SYSTEM/.cursorrules`
   - Para: `seu-projeto/.cursorrules`

3. **Copie os templates (opcional):**
   - De: `DARE-SYSTEM/templates`
   - Para: `seu-projeto/templates`

4. **Copie os exemplos (opcional):**
   - De: `DARE-SYSTEM/examples`
   - Para: `seu-projeto/examples`

5. **Crie a pasta DARE:**
   ```bash
   mkdir -p seu-projeto/DARE/EXECUTION
   ```

---

## ✅ Verificar se Funcionou

1. Abra o Cursor IDE
2. Abra a pasta do seu projeto: **File → Open Folder**
3. Abra o Composer: **Ctrl + I** (Windows/Linux) ou **Cmd + I** (Mac)
4. Digite `/` na caixa de chat
5. Você deve ver os comandos disponíveis:
   - `/generate-design`
   - `/generate-blueprint`
   - `/generate-tasks`
   - `/execute-task`
   - `/generate-dockerfile`
   - `/generate-docker-compose`

Se os comandos aparecerem, está funcionando! 🎉

---

## 🚀 Seu Primeiro Comando

Agora teste o primeiro comando:

```
/generate-design "Criar uma API de autenticação com JWT"
```

A IA vai gerar um arquivo `DARE/DESIGN.md` com toda a estrutura do projeto.

---

## 📚 Próximas Leituras

- **CONFIGURACAO-CURSOR.md**: Guia detalhado de configuração
- **GUIA-DE-USO.md**: Como usar os 4 comandos principais
- **README.md**: Visão geral do sistema

---

## 🆘 Problemas Comuns

### Comando não aparece no Cursor
- Feche e reabra o Cursor
- Verifique se a pasta `.cursor/commands/` existe
- Verifique se os arquivos têm extensão `.md`

### Regras não estão sendo aplicadas
- Verifique se `.cursorrules` está na raiz do projeto
- Feche e reabra o Cursor
- Abra o Composer novamente

### Erro ao executar o script
- No Windows, execute como Administrador
- No Linux/Mac, use `chmod +x setup-projeto.sh` antes de executar

---

Qualquer dúvida, consulte **CONFIGURACAO-CURSOR.md** para instruções detalhadas!
