@echo off
echo Starting AI Portfolio Manager Backend...
cd /d "%~dp0backend"
pip install fastapi uvicorn pandas numpy scipy yfinance pydantic python-multipart -q
python -m uvicorn api:app --reload --host 0.0.0.0 --port 8000
