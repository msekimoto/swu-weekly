param(
  [Parameter(Mandatory = $true)][string]$SubscriptionId,
  [string]$ResourceGroup = "rg-swu-weekly",
  [string]$Location = "brazilsouth",
  [Parameter(Mandatory = $true)][string]$ContainerRegistry,
  [string]$ContainerApp = "swu-weekly-bot",
  [string]$ContainerEnvironment = "aca-swu-weekly"
)

$required = "DISCORD_TOKEN", "DISCORD_APPLICATION_ID", "DISCORD_GUILD_ID", "DISCORD_CHANNEL_ID", "MELEE_TOURNAMENT_ID", "DATABASE_URL"
$missing = $required | Where-Object { -not (Get-Item "Env:$_" -ErrorAction SilentlyContinue).Value }
if ($missing) { throw "Defina estas variáveis de ambiente antes de executar: $($missing -join ', ')" }

az account set --subscription $SubscriptionId
az extension add --name containerapp --upgrade --only-show-errors
az group create --name $ResourceGroup --location $Location --output none
az acr create --name $ContainerRegistry --resource-group $ResourceGroup --sku Basic --admin-enabled true --output none
az acr build --registry $ContainerRegistry --image "swu-weekly:initial" .
az containerapp env create --name $ContainerEnvironment --resource-group $ResourceGroup --location $Location --output none
$acrPassword = az acr credential show --name $ContainerRegistry --query "passwords[0].value" --output tsv
$acrUsername = az acr credential show --name $ContainerRegistry --query username --output tsv

az containerapp create `
  --name $ContainerApp `
  --resource-group $ResourceGroup `
  --environment $ContainerEnvironment `
  --image "$ContainerRegistry.azurecr.io/swu-weekly:initial" `
  --registry-server "$ContainerRegistry.azurecr.io" `
  --registry-username $acrUsername `
  --registry-password $acrPassword `
  --cpu 0.25 --memory 0.5Gi --min-replicas 1 --max-replicas 1 --ingress disabled `
  --secrets "discord-token=$env:DISCORD_TOKEN" "database-url=$env:DATABASE_URL" `
  --env-vars "DISCORD_TOKEN=secretref:discord-token" "DATABASE_URL=secretref:database-url" "DISCORD_APPLICATION_ID=$env:DISCORD_APPLICATION_ID" "DISCORD_GUILD_ID=$env:DISCORD_GUILD_ID" "DISCORD_CHANNEL_ID=$env:DISCORD_CHANNEL_ID" "MELEE_TOURNAMENT_ID=$env:MELEE_TOURNAMENT_ID" "POLL_INTERVAL_SECONDS=30" "ROUND_DURATION_MINUTES=45" "TIMEZONE=America/Sao_Paulo" "ANNOUNCE_ON_START=false" `
  --output none

Write-Host "Azure Container App criada: $ContainerApp"
