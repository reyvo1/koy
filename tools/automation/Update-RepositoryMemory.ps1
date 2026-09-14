param([string]$Module)

Write-Host ""
Write-Host "===================================="
Write-Host "Update Repository Memory"
Write-Host "===================================="

if(Test-Path "AI-Development-Kit\agent\REPOSITORY-MEMORY.md"){
    Write-Host "Repository Memory OK"
}else{
    Write-Host "Repository Memory Missing"
}
