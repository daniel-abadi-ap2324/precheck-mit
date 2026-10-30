@echo off
rem Atajo: verificar.cmd [rapido^|completo^|e2e]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0verificar.ps1" %*
