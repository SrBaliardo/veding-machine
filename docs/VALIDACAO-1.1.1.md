# MedalHive 1.1.1

- Pagamento e situação agora usam seleções com rótulos em português. Os códigos internos não são mostrados ao usuário, inclusive ao reabrir filtros salvos.
- Seleção de produtos: título alterado para "Escolha suas medalhas".
- Selects: espaço reservado de 44 px à direita e seta posicionada a 14 px da borda, incluindo configurações e filtros.
- Caminho do banco confirmado como dinâmico: calculado pelo Electron a partir do usuário e do computador em uso. Os backups automáticos ficam na subpasta backups da pasta de dados.
- Testes de interface e diagnóstico isolam também o cache e a trava de instância do Electron, permitindo verificar uma base temporária sem interferir no aplicativo em uso. O teste exige confirmação explícita de conclusão, evitando falso sucesso quando outra instância está aberta.

Verificação: lint e build aprovados. Teste de interface aprovado com aplicação/reabertura de Crédito, Débito e Concluída, limpeza e funcionamento dos filtros, leitura do caminho efetivo do banco e apresentação do filtro em 640×480. A verificação existente do fluxo de compra e das seis resoluções também passou.

Nenhuma alteração de schema ou migração de dados é necessária nesta atualização.

O executável empacotado 1.1.1 também passou no diagnóstico: banco novo íntegro, quatro produtos, tela inicial, ponte IPC e imagens disponíveis, sem acesso direto ao Node pela interface.
