# Análise inicial da Permedal VM

Data: 19/10/2026. Escopo: leitura do código, consulta de metadados e cadastros no MySQL, execução do build e lint. Não foram realizadas vendas, reposições ou alterações de dados. Não houve validação visual das telas nem execução do instalador em outro computador.

## Objetivo acordado

Aplicação Windows para um terminal de autoatendimento de medalhas, com acesso administrativo a vendas e estoque. Fluxo esperado: início → seleção de modelos e quantidades → conferência → forma de pagamento → espera de confirmação → confirmação visual → dispensa sequencial → retirada → início.

Nesta fase, PIX e cartão serão simulados, com probabilidade de sucesso de 80% por tentativa e 20% de falha de comunicação. Isso é uma probabilidade: não garante exatamente oito sucessos em dez tentativas. O QR Code deve deixar claro que se trata de demonstração e não realizar cobrança real. O Arduino também será simulado, com duração por acionamento e intervalo entre acionamentos configuráveis. O protocolo real será definido posteriormente com o responsável pelo Arduino.

## Como a aplicação está organizada

- `src/`: React, React Router, styled-components, componentes MUI e Ant Design; telas e teclado virtual.
- `electron/main.js`: abre a janela em tela cheia, inicia uma API Express na porta 3001 e contém as consultas SQL e operações de venda/reposição.
- `electron/db.js`: pool MySQL com configuração fixa no código.
- `electron/preload.js`: expõe ipcRenderer diretamente, mas não está vinculado à janela por uma opção preload.
- `vite.config.js`: compilação do frontend e proxy de desenvolvimento.
- `vite.config.electron.js`: compilação do processo principal do Electron.
- `package.json`: comandos de desenvolvimento, build e empacotamento pelo electron-builder.
- `release/`: já contém um instalador e uma pasta win-unpacked, cuja presença não comprova funcionamento em outra máquina.

A interface usa HTTP em localhost:3001 para produtos, gates, vendas e reposições. Não há integração real de pagamento ou comunicação serial com Arduino.

## Estado das telas

| Tela | Situação encontrada |
| --- | --- |
| Login | Aceita qualquer entrada; não autentica; registra usuário e senha no console. |
| Menu | Encaminha para venda, manutenção e relatórios. Não há proteção de rotas administrativas. |
| Início | Tela de toque para começar; a aplicação abre inicialmente no login, não nesta tela. |
| Venda | Consulta produtos ativos, controla quantidades pelo estoque e calcula total. Permite continuar sem itens. Voltar leva ao menu administrativo. |
| Resumo | Existe, mas a venda navega direto para forma de pagamento; a tela também duplica escolhas de pagamento e não transmite o método selecionado. |
| Forma de pagamento | Mostra itens e métodos; registra venda e baixa estoque antes de qualquer confirmação. Acesso sem itens pode quebrar ao ler items[0]. |
| Espera | Sempre mostra confirmação após 3,5 segundos e volta ao início após 7 segundos, independentemente da quantidade comprada. Não simula falhas nem dispensas. |
| Manutenção | Lista gates e permite adicionar estoque. Descarregar coloca zero na tela, mas o salvamento rejeita reduções. Limites não são garantidos no backend. |
| Relatórios | Apenas título e botão de voltar; não há consultas ou indicadores implementados. |

Há dimensões fixas e uso de 100vw dentro de um contêiner com padding, criando condições para transbordamento. O impacto visual precisa ser verificado na resolução e orientação do terminal.

## Banco local: acesso confirmado

Servidor MySQL 8.0.43, schema informado no código como vendingMachineDB. O DBeaver é o cliente de administração, não o servidor do banco.

Foram encontradas seis tabelas e nenhuma view:

- `t_machine_product`: modelos, preço, imagem, estoque e limites; cinco produtos cadastrados, três ativos.
- `t_machine_gate`: códigos e vínculo de produto por pistão; quatro gates cadastrados, três ativos: G001, G002 e G003.
- `t_sale`: cabeçalho da venda, valor, forma de pagamento e datas.
- `t_sale_product`: produtos, quantidades e preços da venda.
- `estoque_produtos` e `vendas`: não são referenciadas no código consultado; confirmar se são legadas antes de qualquer remoção.

Existe o trigger `trg_sync_gate_stock`, executado após UPDATE em t_machine_product. Ele copia estoque atual e limites para todos os gates ligados ao produto. Não foram encontradas procedures/functions ou eventos agendados no schema consultado.

É necessário definir se o estoque deve pertencer ao produto ou ao pistão. Hoje há campos nos dois lugares e sincronização por trigger. Para um mesmo modelo em mais de um pistão, copiar o mesmo estoque para ambos pode representar incorretamente a disponibilidade física.

O banco não contém campos dedicados ao estado do pagamento, estado da dispensa, identificador da tentativa, quantidade efetivamente dispensada ou recuperação de operações interrompidas. Essas informações precisam de modelagem antes da operação real.

## Problemas prioritários

1. A venda e o estoque são confirmados antes do pagamento. A tela de sucesso é apenas um temporizador.
2. Não há sequência por gate, controle de cada unidade ou cálculo de duração da dispensa.
3. O backend aceita preço e total enviados pela interface e não garante estoque suficiente nem quantidades inteiras positivas. A transação existente é útil, mas não substitui essas validações.
4. Não existe proteção contra pedidos duplicados por duplo toque, nova tentativa ou reinício. Repetir a confirmação não pode repetir cobrança, venda ou dispensa.
5. Acesso administrativo não autenticado; API com CORS aberto e listen sem restrição explícita ao loopback. A janela usa nodeIntegration=true e contextIsolation=false. As credenciais do banco estão fixas no código. Esses pontos precisam ser resolvidos antes de distribuição.
6. As imagens dos produtos vêm do banco como caminhos src/assets/images/..., mas não são importadas pelo Vite nem copiadas como um catálogo público. O build atual não inclui essas imagens dinâmicas entre os assets gerados.
7. Fontes, Bootstrap e scripts são carregados de CDNs. A apresentação não fica inteiramente independente da internet.
8. Não há scripts de criação/migração do banco, provisionamento para outra máquina, configuração externa documentada ou rotina de backup.

## Verificações do build

`npm.cmd run build` terminou com código 0, depois de executado fora do sandbox devido a restrições de acesso do ambiente. Isso confirma compilação, não funcionamento do aplicativo instalado.

A compilação do processo principal emitiu vários alertas de módulos Node externalizados para compatibilidade com navegador, incluindo path, http, fs e crypto. A configuração precisa produzir um bundle apropriado para Node/Electron e preservar suas dependências nativas; o build atual pode gerar código inválido para execução.

Outros pontos:

- BrowserRouter combinado com carregamento file:// precisa ser ajustado para as rotas funcionarem na aplicação empacotada.
- O preload é copiado, mas não é utilizado pela BrowserWindow e expõe uma API ampla em vez de operações delimitadas.
- O início em desenvolvimento usa import/export em arquivos .js sem uma definição explícita de módulos no package.json; padronizar o formato e a inicialização.
- O comando dev não espera o Vite estar pronto antes de abrir o Electron.
- package.json e package-lock.json divergem: Vite declarado 5 / instalado 7.1.3; Electron declarado 31 / instalado 37.4.0; ESLint declarado 8 / instalado 9.34.0. electron-is-dev é importado, consta no lock, mas não está declarado no package.json.
- `npm run lint` falhou porque o ESLint 9 instalado espera eslint.config.*, enquanto o projeto fornece .eslintrc.cjs. A configuração antiga também cita plugins não declarados no package.json.
- O empacotamento não instala/configura automaticamente o servidor MySQL nem cria as tabelas no computador de destino.

## Ordem sugerida para lapidar

1. **Base executável:** alinhar dependências, corrigir build Electron, rotas, recursos locais e configuração externa. Validar aplicativo empacotado e depois instalação em Windows limpo. Definir como o banco será disponibilizado em cada máquina.
2. **Compra simulada completa:** introduzir uma operação persistida com estados claros; corrigir conferência do pedido; adicionar pagamento simulado 80/20, falha visível, cancelamento/expiração e nova tentativa. Permitir forçar cenários no desenvolvimento para verificar todos os caminhos.
3. **Dispensa simulada:** associar cada item ao gate, montar uma fila de uma unidade por acionamento, aplicar tempos configuráveis, mostrar progresso e aguardar o término antes de voltar ao início. Não repetir dispensas em caso de atualização da tela.
4. **Estoque e administração:** autenticação, proteção das operações, reposição/ajuste com histórico, limites, consultas de vendas e recuperação de operação interrompida. Registrar separadamente pagamento aprovado e entrega concluída.
5. **Telas do terminal:** revisar resolução, orientação, toques, carregamento, indisponibilidade, mensagens e retorno por inatividade. O timeout de navegação não pode abandonar uma operação paga ou em dispensa.
6. **Integrações reais futuras:** substituir os simuladores mantendo os contratos; definir respostas, timeouts e identificadores com os fornecedores de pagamento e o responsável pelo Arduino.

As etapas de build e fluxo podem avançar em incrementos pequenos, mantendo uma versão demonstrável a cada entrega. Não será necessário integrar pagamento real ou Arduino para demonstrar o ciclo completo.

## Informações ainda necessárias

O acesso ao banco desta máquina já funciona; não é necessário enviar senhas na conversa. Caso haja outro schema com views, informar seu nome e em qual conexão do DBeaver ele aparece. Podemos consultar metadados localmente; para um banco inacessível, um arquivo SQL de estrutura com tabelas, chaves, views e triggers é suficiente inicialmente, sem dados pessoais ou credenciais.

Para orientar as próximas implementações:

- Resolução, orientação e versão do Windows do terminal; presença de touchscreen.
- Se o instalador deve funcionar sem instalar/configurar MySQL separadamente, e se existirão várias máquinas independentes.
- Confirmação do vínculo modelo/pistão e possibilidade de um modelo ocupar mais de um pistão.
- Tempo estimado de avanço/retorno do pistão e intervalo entre acionamentos; podem começar como parâmetros de demonstração.
- Relatórios e operações de estoque que o administrador precisa usar.

Não é necessário resolver todas essas informações antes de corrigir a base e o fluxo simulado.
