Write-Host ""
Write-Host "===================================="
Write-Host "Validation"
Write-Host "===================================="

git status --short

Write-Host ""

git diff --stat

Write-Host ""

npm run build

Write-Host ""

npm test
