param([string]$Module)

Write-Host ""
Write-Host "===================================="
Write-Host "Update Roadmap"
Write-Host "===================================="
Write-Host ""

Write-Host "Module Completed :" $Module
Write-Host "Review docs/roadmap.md"

if(Test-Path "docs\roadmap.md"){
    Write-Host "OK"
}else{
    Write-Host "roadmap.md NOT FOUND"
}
