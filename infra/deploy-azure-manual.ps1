[CmdletBinding()]
param(
  [string]$SubscriptionId,
  [string]$ResourceGroup = "rg-swu-weekly-eastus2",
  [string]$ContainerRegistry = "acrswuweekly9975a3a36b",
  [string]$ContainerApp = "swu-weekly-bot",
  [string]$ImageTag
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Invoke-Az {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & az @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Falha ao executar um comando da Azure CLI. Consulte a mensagem imediatamente anterior para os detalhes." }
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw "Azure CLI não encontrado. Instale-o e execute az login." }
if (-not $SubscriptionId) { $SubscriptionId = Invoke-Az account show --query id --output tsv }
Invoke-Az account set --subscription $SubscriptionId
Invoke-Az extension add --name containerapp --upgrade --only-show-errors

if (-not $ImageTag) {
  $ImageTag = (git rev-parse --short HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível identificar o commit Git atual. Informe -ImageTag explicitamente." }
}
if ($ImageTag -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$') { throw "ImageTag inválida." }

Invoke-Az containerapp show --name $ContainerApp --resource-group $ResourceGroup --output none

$image = "$ContainerRegistry.azurecr.io/swu-weekly:$ImageTag"
Write-Host "Construindo imagem $image..."
Invoke-Az acr build --registry $ContainerRegistry --image "swu-weekly:$ImageTag" .

Write-Host "Atualizando Container App $ContainerApp..."
Invoke-Az containerapp update --name $ContainerApp --resource-group $ResourceGroup --image $image --output none

$revision = Invoke-Az containerapp show --name $ContainerApp --resource-group $ResourceGroup --query properties.latestRevisionName --output tsv
Write-Host "Deploy concluído. Revisão ativa: $revision"
