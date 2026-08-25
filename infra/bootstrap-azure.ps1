[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SubscriptionId,
  [string]$ResourceGroup = "rg-swu-weekly-eastus2",
  [string]$Location = "eastus2",
  [Parameter(Mandatory = $true)][string]$ContainerRegistry,
  [string]$ContainerApp = "swu-weekly-bot",
  [string]$ContainerEnvironment = "aca-swu-weekly"
)

$ErrorActionPreference = "Stop"

function Invoke-Az {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & az @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Falha ao executar: az $($Arguments -join ' ')" }
}

$required = "DISCORD_TOKEN", "DISCORD_APPLICATION_ID", "DISCORD_GUILD_ID", "DISCORD_CHANNEL_ID", "MELEE_TOURNAMENT_ID", "DATABASE_URL"
$missing = $required | Where-Object { -not (Get-Item "Env:$_" -ErrorAction SilentlyContinue).Value }
if ($missing) { throw "Defina estas variáveis de ambiente antes de executar: $($missing -join ', ')" }

Invoke-Az account set --subscription $SubscriptionId
Invoke-Az extension add --name containerapp --upgrade --only-show-errors
Invoke-Az group create --name $ResourceGroup --location $Location --output none
$registryExists = & az acr show --name $ContainerRegistry --output none 2>$null
if ($LASTEXITCODE -ne 0) {
  Invoke-Az acr create --name $ContainerRegistry --resource-group $ResourceGroup --sku Basic --admin-enabled true --output none
} else {
  Write-Host "Reutilizando Azure Container Registry existente: $ContainerRegistry"
}
Invoke-Az acr build --registry $ContainerRegistry --image "swu-weekly:initial" .
$environmentExists = & az containerapp env show --name $ContainerEnvironment --resource-group $ResourceGroup --output none 2>$null
if ($LASTEXITCODE -ne 0) {
  Invoke-Az containerapp env create --name $ContainerEnvironment --resource-group $ResourceGroup --location $Location --output none
} else {
  Write-Host "Reutilizando Container Apps Environment existente: $ContainerEnvironment"
}
$acrPassword = Invoke-Az acr credential show --name $ContainerRegistry --query "passwords[0].value" --output tsv
$acrUsername = Invoke-Az acr credential show --name $ContainerRegistry --query username --output tsv
$databaseUrlBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($env:DATABASE_URL))

Invoke-Az containerapp create `
  --name $ContainerApp `
  --resource-group $ResourceGroup `
  --environment $ContainerEnvironment `
  --image "$ContainerRegistry.azurecr.io/swu-weekly:initial" `
  --registry-server "$ContainerRegistry.azurecr.io" `
  --registry-username $acrUsername `
  --registry-password $acrPassword `
  --cpu 0.25 --memory 0.5Gi --min-replicas 1 --max-replicas 1 --ingress disabled `
  --secrets "discord-token=$env:DISCORD_TOKEN" "database-url-base64=$databaseUrlBase64" `
  --env-vars "DISCORD_TOKEN=secretref:discord-token" "DATABASE_URL_BASE64=secretref:database-url-base64" "DISCORD_APPLICATION_ID=$env:DISCORD_APPLICATION_ID" "DISCORD_GUILD_ID=$env:DISCORD_GUILD_ID" "DISCORD_CHANNEL_ID=$env:DISCORD_CHANNEL_ID" "MELEE_TOURNAMENT_ID=$env:MELEE_TOURNAMENT_ID" "POLL_INTERVAL_SECONDS=30" "ROUND_DURATION_MINUTES=45" "TIMEZONE=America/Sao_Paulo" "ANNOUNCE_ON_START=false" `
  --output none

Write-Host "Azure Container App criada: $ContainerApp no resource group $ResourceGroup"
