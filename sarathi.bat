@echo off
cd /d "C:\Users\DELL\The Web Developer Bootcamp 2024\JAVASCRIPT COURSE\Projects\Sarathi\Sarathi.bat"
start cmd.exe /k "npm run dev:full"
timeout /t 5 /nobreak
start http://localhost:5000