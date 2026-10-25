# MedalHive

Totem Windows de medalhas comemorativas. React na interface, Electron no aplicativo e SQLite local, sem servidor MySQL ou DBeaver como pré-requisito.

## Executar

Para desenvolvimento, use Node.js 22.13 ou superior e uma versão compatível com o Vite instalado (preferencialmente Node 22.18+):

```powershell
npm ci
npm run dev
```

O Electron abre depois de o Vite estar pronto. `npm run dev:react` disponibiliza uma prévia no navegador, com uma base independente em `.local/preview.sqlite`. O aplicativo Electron usa outra base; os dados da prévia não aparecem no aplicativo.

Para executar o build local:

```powershell
npm run build
npm start
```

`npm start -- --windowed` abre em janela. Sem essa opção, abre em tela cheia.

## Instalador Windows x64

```powershell
npm run full-build
```

Saída: `release/medalhive/MedalHive-Setup-1.1.1.exe`. `npm run package:dir` gera apenas a pasta executável. Não há compilação de módulos SQLite nativos de terceiros: o runtime Electron já inclui o SQLite.

O instalador não inclui certificado de assinatura digital contratado. O pacote foi desenvolvido para Windows 10/11 x64; valide o instalador também no computador de destino, incluindo permissões, monitor e escala do Windows. A verificação automatizada local não substitui essa validação em uma instalação limpa.

## Primeiro uso

1. Abra **Administrador** e crie usuário e senha (mínimo de seis caracteres). Não existe senha padrão.
2. Entre em **Estoque e pistões** e registre o abastecimento. A base nova começa com estoque zero.
3. Volte à tela inicial para escolher medalhas, conferir quantidades e selecionar o pagamento.
4. O pagamento leva aproximadamente cinco segundos. A confirmação permanece dois segundos e a dispensa segue uma unidade por vez.

Catálogo: Abelhas Robô (R$ 5,50), Dev Lucas (R$ 7,00), Dev John (R$ 5,00) e Hivetron (R$ 6,30). Cada modelo possui um pistão virtual: G001 a G004. Capacidade de exemplo: 360 por pistão; mínimo: 5.

As imagens `hivetroncoin_*.png` e o banner MedalHive são empacotados localmente. Não há dependência de fontes, Bootstrap, imagens ou scripts de CDNs.

## Dados locais e backups

A base é criada automaticamente em `%APPDATA%/MedalHive/data/medalhive.sqlite`, pela conta Windows que executa o aplicativo. Execute sempre pela conta do totem; outro usuário Windows terá uma base independente. A tela **Configurações → Dados e backups** exibe o caminho efetivo.

Tabelas, chaves, índices e views são criados por migração versionada em `electron/store.cjs`. Valores monetários são armazenados em centavos; o estoque pertence ao pistão. O banco usa transações, chaves estrangeiras, WAL e sincronização FULL.

O aplicativo cria uma cópia diária ao iniciar e conserva as últimas 14 cópias diárias. Há exportação e restauração manual na administração. A restauração aceita backup íntegro da mesma máquina, sem compras em andamento no arquivo, e salva uma cópia do estado atual antes da substituição. Atualizar o programa não recria nem zera a base; desinstalar preserva os dados por padrão.

O MySQL anterior não é consultado nem alterado por esta versão. O histórico e o estoque antigos não foram importados: a base MedalHive começa nova. Para consultar SQL sem afetar a operação, abra uma cópia de backup no DBeaver com uma conexão SQLite.

## Demonstração

**Nenhuma cobrança real, comando físico ou transmissão à plataforma web é realizado.** Todos os registros são identificados como demonstração.

- Pagamento: 80% de probabilidade de sucesso e 20% de falha de comunicação por tentativa. Não há garantia de oito aprovações em dez tentativas.
- PIX: QR Code explicitamente fictício, sem payload de cobrança real.
- Configurações: force sucesso/falha para demonstrar ambos os cenários de pagamento e sincronização.
- Arduino: acionamento padrão de 850 ms e intervalo de 450 ms, configuráveis. O estoque baixa apenas quando cada unidade simulada termina.
- Reinício durante entrega: preserva progresso e reserva de estoque, marca a operação como interrompida e exige retomada administrativa. A retomada é exclusiva desta simulação; a integração física futura precisará reconciliar confirmações do Arduino.
- Rede: o painel, estoque e relatórios continuam locais. A indisponibilidade de rede impede iniciar o pagamento simulado ou sincronizar. A indicação de rede não comprova disponibilidade do provedor real.
- Sincronização: confirma eventos localmente em lotes, sem enviar dados reais. As confirmações simuladas ficam separadas das reais. Veja [o contrato da plataforma](docs/SINCRONIZACAO.md).

## Relatórios e toque

Vendas e itens têm filtros por coluna, ordenação e paginação. Os detalhes preservam preço unitário, subtotal, quantidade, pagamento, estado e unidades entregues. Indicadores de faturamento consideram somente compras concluídas. Em telas estreitas, as colunas são divididas em grupos navegáveis, sem rolagem horizontal ou vertical.

O layout se adapta à altura e largura, com paginação de produtos e linhas. Referência mínima de teste: área útil de 640×480 CSS px. Foram previstas orientações vertical e horizontal, inclusive teclado virtual aberto. Em resolução inferior, o espaço físico pode impedir leitura e toque adequados.

O teclado permite acentos, símbolos, maiúsculas, números, cursor, seleção, apagar e avanço entre campos. O teclado físico continua disponível.

## Verificar

```powershell
npm test
npm run lint
npm run build
npm run test:ui
```

Os testes de dados usam bases temporárias. Os testes de interface usam o Electron real com o renderer compilado e uma base exclusiva em `.tmp`, gerando capturas em `.tmp/screenshots`. Não alteram a base de uso do totem.

## Organização

- `electron/store.cjs`: schema, transações, simulações, histórico, autenticação e fila de sincronização.
- `electron/main.cjs`: ciclo de vida, IPC restrito, execução dos simuladores e diálogos de backup.
- `electron/preload.cjs`: ponte limitada entre interface e processo principal.
- `src/medalhive/`: interface ativa, tema, catálogo e teclado.
- `tests/`: verificações de dados e fluxo no Electron.

O código ativo da interface está em `src/medalhive`. Telas, componentes, imagens e configurações da versão anterior foram removidos após verificar suas referências. A API HTTP antiga e as credenciais MySQL fixas não fazem parte do aplicativo.

As pastas `dist`, `build` e `release` contêm saídas geradas. `node_modules` contém as dependências instaladas. `.local` guarda a base de desenvolvimento e não deve ser apagada como se fosse cache. `.tmp` contém somente resultados temporários de testes e pode ser recriada automaticamente pelos scripts de verificação.

