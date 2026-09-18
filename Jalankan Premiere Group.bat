@echo off
title Premiere Group - Server (JANGAN TUTUP jendela ini selama aplikasi dipakai)
cd /d "%~dp0"

echo ============================================================
echo   PREMIERE GROUP
echo   Server lokal dijalankan di http://localhost:8777
echo ------------------------------------------------------------
echo   Admin Panel : http://localhost:8777/admin.html
echo   User App    : http://localhost:8777/
echo ------------------------------------------------------------
echo   Biarkan jendela ini terbuka. Tutup jendela = server mati.
echo ============================================================
echo.

rem Buka browser beberapa detik setelah server siap
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start "" http://localhost:8777/admin.html & timeout /t 1 /nobreak >nul & start "" http://localhost:8777/"

powershell -ExecutionPolicy Bypass -NoProfile -File "tools\serve.ps1" -Port 8777

echo.
echo Server berhenti. Tekan tombol apa saja untuk menutup.
pause >nul
