[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
node ".\scripts\manage-module-state.mjs" status
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
