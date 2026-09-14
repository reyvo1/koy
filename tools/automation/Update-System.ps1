Write-Host ""
Write-Host "===================================="
Write-Host "SYSTEM Verification"
Write-Host "===================================="

if(Test-Path "AI-Development-Kit\architecture\SYSTEM.md"){
    Write-Host "SYSTEM.md OK"
}else{
    Write-Host "SYSTEM.md Missing"
}
