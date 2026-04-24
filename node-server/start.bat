@echo off
echo Starting Python service...
start "Python Service" cmd /k "python clothefinder.py"
timeout /t 2 /nobreak >nul
echo Starting Node.js service...
start "Node.js Service" cmd /k "npm start"
timeout /t 2 /nobreak >nul
echo Starting backend API service...
start "API Service" cmd /k "cd ..\backend\api\src && python -m uvicorn api.main_v3:app --host localhost --port 8000"
timeout /t 2 /nobreak >nul
echo All services have been started. Do not close this window.
echo To stop services, please close the corresponding command windows.
echo.
echo Service addresses:
echo - Node.js service: http://localhost:3000
echo - Backend API service: http://localhost:8000
echo - API documentation: http://localhost:8000/docs
echo - Health check: http://localhost:8000/health
echo.
pause
