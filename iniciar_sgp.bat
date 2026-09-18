@echo off
chcp 65001 > nul
cd /d "%~dp0"
title SGP SANTOS MANUTENÇÃO - Servidor Local

echo ===================================================================
echo               SGP SANTOS MANUTENÇÃO - SISTEMA INICIADO
echo ===================================================================
echo.

rem Verifica se o servidor ja esta ativo na porta 8080
netstat -ano | findstr ":8080" | findstr "LISTENING" > nul
if %errorlevel% equ 0 (
    echo  O servidor ja esta em execucao!
    echo  Abrindo o sistema no seu navegador...
    start "" http://localhost:8080
    timeout /t 2 > nul
    exit /b
)

echo  Iniciando o servidor local...
echo.

set PYTHON_CMD="C:\Program Files\QGIS 3.36.2\apps\Python312\python.exe"

if not exist %PYTHON_CMD% (
    set PYTHON_CMD=python
)

start "" http://localhost:8080

%PYTHON_CMD% server.py

pause
