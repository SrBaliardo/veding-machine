# Validação da versão 1.1.0

Validação local em Windows, em 19/10/2026. Nenhum dado do MySQL foi modificado. Os testes utilizaram bases SQLite exclusivas e temporárias.

- 11 testes de dados aprovados: criação automática, integridade, autenticação, preços do banco, quantidades, reservas, duplicidade, falha e repetição de pagamento, cancelamento, dispensa sequencial, retomada após reinício, sincronização, backup e operação local sem rede.
- ESLint aprovado no código ativo, backend, scripts e testes.
- Build Vite aprovado, com imagens e estilos locais.
- Fluxo de interface aprovado no Electron 44.9.0: criação do administrador, ajuste de estoque, edição por teclado touch com seleção de texto, conferência, PIX fictício, aprovação, dispensa, retorno automático, filtros, detalhamento e sincronização simulada.
- Telas principais verificadas nas dimensões solicitadas de 640×480, 800×600, 1024×768, 768×1024, 1080×1920 e 1366×768. A escala do Windows pode produzir arredondamento de 1–2 CSS px no viewport do Electron. Não foi detectado transbordamento vertical nas verificações. Login e ajuste de estoque foram verificados com teclado aberto na menor dimensão.
- Executável empacotado aprovado em primeira abertura com base vazia: app.isPackaged=true, quatro produtos, SQLite 3.53.4, PRAGMA integrity_check=ok, tela inicial e IPC disponíveis, nenhuma imagem quebrada e nenhum require/Node exposto à interface.
- Auditoria npm das dependências de produção: zero vulnerabilidades informadas no momento da verificação. As ferramentas de desenvolvimento ainda apresentam oito avisos moderados ligados à cadeia sprintf-js/roarr/global-agent do empacotador; o npm sugere uma alteração forçada de versão para eliminá-los, que não foi aplicada. Não há avisos altos ou críticos restantes nessa verificação completa.

O instalador está em `release/medalhive/MedalHive-Setup-1.1.0.exe`. O runtime Electron e o ícone são preparados antes do empacotamento para evitar falhas de extração/renomeação e conversão WebAssembly observadas nas ferramentas neste Windows.

As capturas ficam em `.tmp/screenshots`. O diagnóstico do executável pode ser repetido com `node scripts/check-package.cjs`, depois de gerar o pacote; ele cria outra base exclusiva, não instala o programa e não usa dados reais.

Ainda não foi executada instalação em um segundo Windows limpo, nem teste em um monitor touch físico. Pagamentos, Arduino e plataforma web continuam exclusivamente simulados, conforme o escopo aprovado. Não houve importação do histórico MySQL para a base nova.
