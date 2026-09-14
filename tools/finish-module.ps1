[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 30)]
    [int]$Module,

    [Parameter(Mandatory = $true)]
    [string]$Evidence
)

$ErrorActionPreference = "Stop"
node ".\scripts\manage-module-state.mjs" complete $Module --evidence $Evidence
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run module:validate
