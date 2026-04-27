@echo off
REM Script de Setup Rápido do Sistema DARE para Windows
REM Este script copia automaticamente todos os arquivos necessários para seu projeto

setlocal enabledelayedexpansion

REM Verificar se o diretório de destino foi fornecido
if "%1"=="" (
    echo ❌ Erro: Você deve fornecer o caminho do projeto de destino
    echo Uso: setup-projeto.bat C:\caminho\para\seu\projeto
    pause
    exit /b 1
)

set DEST_PROJECT=%1

REM Verificar se o diretório de destino existe
if not exist "%DEST_PROJECT%" (
    echo ❌ Erro: O diretório '%DEST_PROJECT%' não existe
    pause
    exit /b 1
)

echo 🚀 Iniciando setup do Sistema DARE em: %DEST_PROJECT%
echo.

REM Copiar .cursor
echo 📋 Copiando pasta .cursor...
xcopy ".cursor" "%DEST_PROJECT%\.cursor" /E /I /Y >nul
if %errorlevel% equ 0 (
    echo ✓ Pasta .cursor copiada
) else (
    echo ❌ Erro ao copiar .cursor
    pause
    exit /b 1
)

REM Copiar .cursorrules
echo 📋 Copiando .cursorrules...
copy ".cursorrules" "%DEST_PROJECT%\.cursorrules" >nul
if %errorlevel% equ 0 (
    echo ✓ Arquivo .cursorrules copiado
) else (
    echo ❌ Erro ao copiar .cursorrules
    pause
    exit /b 1
)

REM Criar diretório DARE se não existir
if not exist "%DEST_PROJECT%\DARE" (
    echo 📋 Criando diretório DARE...
    mkdir "%DEST_PROJECT%\DARE\EXECUTION"
    echo ✓ Diretório DARE criado
)

REM Copiar templates
echo 📋 Copiando templates...
xcopy "templates" "%DEST_PROJECT%\templates" /E /I /Y >nul
if %errorlevel% equ 0 (
    echo ✓ Templates copiados
)

REM Copiar exemplos
echo 📋 Copiando exemplos...
xcopy "examples" "%DEST_PROJECT%\examples" /E /I /Y >nul
if %errorlevel% equ 0 (
    echo ✓ Exemplos copiados
)

echo.
echo ✅ Setup concluído com sucesso!
echo.
echo 📋 Próximos passos:
echo 1. Abra a pasta do projeto no Cursor: File → Open Folder → %DEST_PROJECT%
echo 2. Abra o Composer: Ctrl + I
echo 3. Digite / para ver os comandos disponíveis
echo 4. Comece com: /generate-design "Sua ideia aqui"
echo.
echo 📖 Para mais informações, leia: CONFIGURACAO-CURSOR.md
echo.
pause
