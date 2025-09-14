@echo off
REM Start the Node.js WebSocket server

REM Change directory to the folder where server.js is located
cd /d "%~dp0"

REM Start the server
node server.js

pause