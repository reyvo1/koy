param([string]$Module)

Write-Host ""
Write-Host "===================================="
Write-Host "Update Project State"
Write-Host "===================================="
Write-Host ""

if(Test-Path "docs\project-state.md"){
    Write-Host "project-state.md FOUND"
}else{
    Write-Host "project-state.md NOT FOUND"
}
