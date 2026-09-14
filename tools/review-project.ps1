Write-Host ""
Write-Host "========================================="
Write-Host " IoT Platform Architecture Review"
Write-Host "========================================="
Write-Host ""

$files=@(
"docs/architecture.md",
"docs/roadmap.md",
"AI-Development-Kit/architecture/SYSTEM.md",
"AI-Development-Kit/agent/REPOSITORY-MEMORY.md"
)

foreach($f in $files){

    Write-Host ""
    Write-Host "-----------------------------------------"
    Write-Host $f

    if(Test-Path $f){

        $lines=(Get-Content $f).Count

        Write-Host "OK ($lines lines)"

    }else{

        Write-Host "MISSING"

    }

}

Write-Host ""
Write-Host "Git Status"
git status --short
