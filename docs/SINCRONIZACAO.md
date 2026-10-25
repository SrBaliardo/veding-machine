# Contrato proposto para a futura plataforma MedalHive

Esta versão usa somente confirmação simulada local. Não existe endereço remoto configurado e nenhum dado é transmitido. A detecção de rede pelo sistema operacional indica disponibilidade de rede; não comprova acesso à internet ou à futura API.

## Identificação e entrega

Cada base criada recebe um machineId UUID permanente. Cada venda, tentativa, dispensa, movimentação e evento recebe UUID independente. O destino deve autenticar cada máquina e validar sua vinculação à organização.

Um evento da outbox é gravado na mesma transação da operação correspondente. A sequência de envio é a rowid da outbox, crescente na base atual. Lotes contêm no máximo 250 eventos. Os registros não são excluídos após envio. O retorno de cada evento precisa ser confirmado individualmente pelo servidor; uma resposta perdida pode causar reenvio e deve ser tratada pela chave única (machineId,eventId).

Exemplo de contrato a implementar na futura API HTTPS:

```json
{
  "schemaVersion": 1,
  "machineId": "UUID da máquina",
  "events": [{
    "eventId": "UUID do evento",
    "sequence": 1,
    "kind": "stock.adjusted",
    "entityId": "UUID da movimentação",
    "occurredAt": "2026-10-19T15:00:00.000Z",
    "demo": true,
    "payload": { "gateId": "G001", "productId": "teambee", "delta": 20, "balance": 20, "reason": "Abastecimento" }
  }]
}
```

Resposta proposta: `{ "acknowledgedEventIds": ["UUID do evento"] }`. Rejeições devem indicar evento e motivo. Timeout não significa rejeição. Um lote deve manter os mesmos IDs durante tentativas repetidas.

## Conteúdo

- machine.registered: nome, versão do schema, identificação de demonstração e catálogo/inventário inicial.
- sale.created / sale.retry / sale.cancelled: pedido e seus itens com nomes e preços históricos.
- payment.approved / payment.failed: estado da compra; nesta versão todos os pagamentos são fictícios.
- dispense.completed: progresso de entrega por unidade.
- stock.changed / stock.adjusted: movimentações, pistão e saldo; o histórico deve ser preservado além do saldo agregado.
- sale.completed / sale.interrupted / sale.resumed: resultado e recuperação da entrega.

Valores monetários são inteiros em centavos de BRL. Datas são persistidas em UTC e exibidas no horário local. A plataforma precisa exibir a data da última sincronização e tratar o saldo como última posição recebida.

## Demonstração e troca pelo serviço real

A simulação persiste sync_runs e simulated_receipts e atualiza somente simulated_synced_at. O campo synced_at, reservado à confirmação real, continua vazio. Portanto, um envio simulado nunca será confundido com entrega real. O botão pode enviar novos lotes até não haver pendências simuladas.

O backend real deve ignorar saldos de eventos mais antigos que a posição já recebida. Alterações recebidas do painel web não foram implementadas: esta primeira versão é de envio de dados da máquina para a plataforma.

Ao desenvolver a API, será necessário definir credenciais por máquina, gestão de revogação, política de envio real de dados de demonstração, alterações remotas e reconciliação após restauração de backup. Restaurar um backup antigo pode reintroduzir eventos já conhecidos pelo servidor e recuar a sequência local; será necessário um protocolo explícito de recuperação/época para esse caso, antes de habilitar sincronização real. Não copie a mesma base para totens independentes: cada totem deve ter sua própria identidade.
