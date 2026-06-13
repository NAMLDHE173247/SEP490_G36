@echo off
title SEP490 - GPU Service Launcher
echo ==============================================================
echo       KHOI DONG DICH VU GPU - TUTOR AUTO TRAIN (SEP490)
echo ==============================================================
echo [1/4] Kiem tra moi truong Python...

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Khong tim thay Python! Vui long cai dat Python 3.10 hoac 3.11:
    echo https://www.python.org/downloads/
    echo.
    echo Luu y: Nho check vao o "Add Python to PATH" khi cai dat.
    pause
    exit /b
)

cd gpu-service

echo [2/4] Khoi tao Moi truong ao (Virtual Environment)...
if not exist venv_gpu (
    echo Dang tao thu muc moi truong ao 'venv_gpu' (chi chay lan dau)...
    python -m venv venv_gpu
)

echo Kich hoat moi truong ao...
call venv_gpu\Scripts\activate

echo [3/4] Cap nhat pip va cai dat cac thu vien can thiet...
echo Qua trinh nay co the mat vai phut trong lan dau tien...
python -m pip install --upgrade pip
pip install -r requirements.txt

echo.
echo ==============================================================
echo [4/4] Dang khoi dong GPU Service tren cong 5000...
echo Vui long giu nguyen cua so nay de duy tri ket noi GPU.
echo He thong web se tu dong nhan dien va ket noi.
echo ==============================================================
echo.

python app.py

pause
