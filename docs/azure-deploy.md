# Publicação no Azure

O repositório possui um workflow que, a cada push na `main`, testa o projeto, cria uma imagem no Azure Container Registry (ACR) e atualiza a Azure Container App. Ele fica deliberadamente inativo até as variáveis Azure abaixo existirem no GitHub.

## 1. Inicializar tudo uma única vez

O caminho recomendado é executar um único script, que cria a infraestrutura, configura OIDC e cadastra secrets/variables no GitHub:

```powershell
./infra/init-azure-project.ps1
```

Ele usa a assinatura Azure já selecionada, cria os recursos em `eastus2` e gera um nome único para o ACR. Se uma tentativa anterior já tiver criado um único ACR com o prefixo `acrswuweekly`, ele o reutiliza automaticamente. Para selecionar outra assinatura, região ou nome de ACR, passe `-SubscriptionId`, `-Location` ou `-ContainerRegistry`.

## Alternativa: criar somente os recursos Azure

No PowerShell, entre na pasta do projeto, carregue as variáveis do `.env` para a sessão sem mostrá-las e execute o bootstrap:

```powershell
Get-Content .env | Where-Object { $_ -match '^[^#].+=' } | ForEach-Object {
  $name, $value = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
./infra/bootstrap-azure.ps1 -SubscriptionId '<subscription-id-real>' -ContainerRegistry '<nome-unico-do-acr>'
```

Use uma Subscription ID real, sem os caracteres `<` e `>`. O padrão é `eastus2`: `eastus` já está ocupado pelo ambiente do outro projeto, e assinaturas Azure for Students permitem apenas um Container Apps Environment por região. O nome do ACR deve ser globalmente único, somente letras/números, e a senha do Discord nunca é enviada ao GitHub. O script entrega o token e a connection string do Neon diretamente como secrets da Container App.

## 2. Autorizar GitHub Actions com OIDC

Crie uma identidade federada para `repo:msekimoto/swu-weekly:environment:production`, com permissão **Contributor** no resource group. Cadastre estes *GitHub Actions secrets*:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Cadastre estes *GitHub Actions variables*:

- `AZURE_RESOURCE_GROUP` (por padrão `rg-swu-weekly-eastus2`)
- `AZURE_CONTAINER_REGISTRY` (somente o nome, sem `.azurecr.io`)
- `AZURE_CONTAINER_APP` (por padrão `swu-weekly-bot`)

OIDC evita guardar um segredo de Azure de longa duração no GitHub. A ação só receberá um token para a identidade federada configurada. O `init-azure-project.ps1` automatiza toda esta seção.

## 3. Deploys seguintes

Faça push na `main`. A workflow **Deploy bot to Azure** aparecerá em Actions. Ela sempre roda testes; só executa o deploy depois que as três variables Azure estiverem configuradas.

## Deploy manual (recomendado sem permissão no Microsoft Entra ID)

Se a conta não puder criar um App Registration no Microsoft Entra ID, o bot continua hospedado normalmente na Container App, mas o GitHub Actions não conseguirá autenticar na Azure. Para publicar uma alteração a partir do seu computador já autenticado na Azure, execute:

```powershell
./infra/deploy-azure-manual.ps1
```

O script cria uma imagem com a revisão Git atual no ACR e atualiza a Container App. Ele não lê nem imprime o `.env`, não altera os secrets do bot e não requer OIDC. Para atualizar token do Discord ou connection string do Neon, altere-os diretamente nos secrets da Container App antes do deploy.
