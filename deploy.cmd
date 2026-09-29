@echo off
REM ============================================================
REM  fam-io — Vercel'e komut satırından deploy
REM
REM  Kullanım (proje klasöründe, cmd):
REM    deploy            -> production'a deploy eder
REM    deploy env        -> .env.local'deki değişkenleri Vercel'e yükler, sonra deploy eder
REM    deploy preview    -> önizleme (preview) deploy'u
REM ============================================================
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

where node >nul 2>nul || (echo [HATA] Node.js bulunamadı. https://nodejs.org adresinden kur. & exit /b 1)

REM Vercel CLI yoksa kur
where vercel >nul 2>nul
if errorlevel 1 (
  echo Vercel CLI kuruluyor...
  call npm i -g vercel || (echo [HATA] Vercel CLI kurulamadı. & exit /b 1)
)

REM Giriş yapılmamışsa giriş iste
call vercel whoami >nul 2>nul
if errorlevel 1 (
  echo Vercel hesabına giriş yap:
  call vercel login || exit /b 1
)

REM Proje bağlı değilse bağla (ilk seferde sorular sorar)
if not exist ".vercel\project.json" (
  echo Proje Vercel'e bağlanıyor...
  call vercel link || exit /b 1
)

REM Ortam değişkenlerini yükle
if /i "%~1"=="env" (
  if not exist ".env.local" (echo [HATA] .env.local bulunamadı. .env.example dosyasını kopyalayıp doldur. & exit /b 1)
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env.local") do (
    if not "%%B"=="" (
      echo  - %%A
      call vercel env rm %%A production -y >nul 2>nul
      (<nul set /p="%%B") | vercel env add %%A production >nul
    )
  )
  echo Ortam değişkenleri yüklendi.
)

if /i "%~1"=="preview" (
  call vercel
) else (
  call vercel --prod
)
endlocal
