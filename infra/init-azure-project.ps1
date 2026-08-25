[CmdletBinding()]
param(
  [string]$SubscriptionId,
  [string]$ResourceGroup = "rg-swu-weekly-eastus",
  [string]$Location = "eastus",
  [string]$ContainerRegistry,
  [string]$ContainerApp = "swu-weekly-bot",
  [string]$ContainerEnvironment = "aca-swu-weekly",
  [string]$GitHubRepo = "msekimoto/swu-weekly"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Invoke-Az {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & az @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Falha ao executar: az $($Arguments -join ' ')" }
}

function Invoke-Gh {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & gh @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Falha ao executar: gh $($Arguments -join ' ')" }
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw "Azure CLI não encontrado. Instale-o e execute az login." }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "GitHub CLI não encontrado. Instale-o e execute gh auth login." }
Invoke-Gh auth status | Out-Null

$envFile = Join-Path $projectRoot ".env"
if (-not (Test-Path $envFile)) { throw ".env não encontrado em $projectRoot" }
Get-Content $envFile | Where-Object { $_ -match '^[^#].+=' } | ForEach-Object {
  $name, $value = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

$required = "DISCORD_TOKEN", "DISCORD_APPLICATION_ID", "DISCORD_GUILD_ID", "DISCORD_CHANNEL_ID", "MELEE_TOURNAMENT_ID", "DATABASE_URL"
$missing = $required | Where-Object { -not (Get-Item "Env:$_" -ErrorAction SilentlyContinue).Value }
if ($missing) { throw "O .env não possui: $($missing -join ', ')" }

if (-not $SubscriptionId) { $SubscriptionId = Invoke-Az account show --query id --output tsv }
Invoke-Az account set --subscription $SubscriptionId
$tenantId = Invoke-Az account show --query tenantId --output tsv

if (-not $ContainerRegistry) {
  $suffix = ([Guid]::NewGuid().ToString("N")).Substring(0, 10)
  $ContainerRegistry = "acrswuweekly$suffix"
}
if ($ContainerRegistry -notmatch '^[a-z0-9]{5,50}$') { throw "ContainerRegistry deve ter 5-50 caracteres, somente letras minúsculas e números." }

Write-Host "Criando infraestrutura Azure em $Location..."
& (Join-Path $PSScriptRoot "bootstrap-azure.ps1") `
  -SubscriptionId $SubscriptionId `
  -ResourceGroup $ResourceGroup `
  -Location $Location `
  -ContainerRegistry $ContainerRegistry `
  -ContainerApp $ContainerApp `
  -ContainerEnvironment $ContainerEnvironment
if ($LASTEXITCODE -ne 0) { throw "O bootstrap da Azure falhou." }

$displayName = "github-swu-weekly-deploy"
$app = Invoke-Az ad app list --display-name $displayName --query "[0]" --output json | ConvertFrom-Json
if (-not $app) {
  $app = Invoke-Az ad app create --display-name $displayName --output json | ConvertFrom-Json
  Write-Host "App registration criada para GitHub Actions."
}

$servicePrincipal = $null
try { $servicePrincipal = Invoke-Az ad sp show --id $app.appId --output json | ConvertFrom-Json } catch { }
if (-not $servicePrincipal) {
  $servicePrincipal = Invoke-Az ad sp create --id $app.appId --output json | ConvertFrom-Json
  Start-Sleep -Seconds 5
}

$scope = "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup"
Invoke-Az role assignment create --assignee-object-id $servicePrincipal.id --assignee-principal-type ServicePrincipal --role Contributor --scope $scope --output none

$federatedName = "github-swu-weekly-production"
$credentials = Invoke-Az ad app federated-credential list --id $app.id --output json | ConvertFrom-Json
if (-not ($credentials | Where-Object { $_.name -eq $federatedName })) {
  $credential = @{ name = $federatedName; issuer = "https://token.actions.githubusercontent.com"; subject = "repo:$GitHubRepo:environment:production"; audiences = @("api://AzureADTokenExchange") } | ConvertTo-Json -Compress
  Invoke-Az ad app federated-credential create --id $app.id --parameters $credential --output none
}

Invoke-Gh api --method PUT "repos/$GitHubRepo/environments/production" | Out-Null
Invoke-Gh secret set AZURE_CLIENT_ID --repo $GitHubRepo --body $app.appId | Out-Null
Invoke-Gh secret set AZURE_TENANT_ID --repo $GitHubRepo --body $tenantId | Out-Null
Invoke-Gh secret set AZURE_SUBSCRIPTION_ID --repo $GitHubRepo --body $SubscriptionId | Out-Null
Invoke-Gh variable set AZURE_RESOURCE_GROUP --repo $GitHubRepo --body $ResourceGroup | Out-Null
Invoke-Gh variable set AZURE_CONTAINER_REGISTRY --repo $GitHubRepo --body $ContainerRegistry | Out-Null
Invoke-Gh variable set AZURE_CONTAINER_APP --repo $GitHubRepo --body $ContainerApp | Out-Null

Write-Host ""
Write-Host "Inicialização concluída."
Write-Host "Container App: $ContainerApp"
Write-Host "ACR: $ContainerRegistry.azurecr.io"
Write-Host "Resource group: $ResourceGroup"
Write-Host "O próximo push na main fará deploy automaticamente."
