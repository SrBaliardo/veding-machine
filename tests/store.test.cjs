const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Store } = require('../electron/store.cjs');

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'medalhive-test-'));
  let time = 10000;
  let online = true;
  const store = new Store(path.join(directory, 'test.sqlite'), { clock: () => time, random: options.random || (() => 0.1), online: () => online });
  const auth = store.setup({ username: 'admin', password: 'teste123' });
  store.products().forEach(p => store.call('adjustStock', { gateId: p.gate_id, stock: 20, reason: 'Abastecimento de teste' }, auth.token));
  const stores = [store];
  t.after(() => {
    stores.forEach(db => { try { db.close(); } catch { /* Already closed by the restart test. */ } });
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { store, token: auth.token, directory, track: db => stores.push(db), tick: (ms = 1000) => { time += ms; store.advance(); }, offline: () => { online = false; }, online: () => { online = true; }, clock: () => time };
}
const order = (items = [{ id: 'teambee', quantity: 2 }], paymentType = 'PIX') => ({ requestId: randomUUID(), paymentType, items });

test('criação automática, catálogo, views e credenciais protegidas', t => {
  const { store } = fixture(t);
  assert.equal(store.get('PRAGMA user_version').user_version, 1);
  assert.equal(store.get('PRAGMA foreign_keys').foreign_keys, 1);
  assert.equal(store.get('PRAGMA synchronous').synchronous, 2);
  assert.deepEqual(store.products().map(p => p.name), ['Abelhas Robô','Dev Lucas','Dev John','Hivetron']);
  assert.ok(!store.meta('admin').includes('teste123'));
  assert.throws(() => store.setup({ username: 'admin', password: 'outrasenha' }), /já foi/);
  assert.throws(() => store.call('adjustStock', {}), /Sessão/);
  assert.throws(() => store.call('exec', { sql: 'DROP TABLE sales' }), /desconhecida/);
  assert.throws(() => store.login({ username: 'admin', password: 'incorreta' }), /inválidos/);
});

test('pedido usa preços do banco, reserva estoque e impede duplicidade', t => {
  const { store } = fixture(t);
  const input = order([{ id: 'teambee', quantity: 2, price: 1 }]); input.total = 1;
  const sale = store.createSale(input);
  assert.equal(sale.total_cents, 1100);
  assert.equal(store.products()[0].stock, 20);
  assert.equal(store.products()[0].available, 18);
  assert.equal(store.createSale(input).id, sale.id);
  assert.equal(store.get('SELECT COUNT(*) AS n FROM payment_attempts').n, 1);
  assert.throws(() => store.createSale(order()), /andamento/);
});

test('rejeita quantidades inválidas, duplicadas e estoque insuficiente sem registros parciais', t => {
  const { store } = fixture(t);
  for (const quantity of [0,-1,1.5,'2',101,21]) assert.throws(() => store.createSale(order([{ id: 'teambee', quantity }])));
  assert.throws(() => store.createSale(order([{ id: 'teambee', quantity: 1 },{ id: 'teambee', quantity: 1 }])), /duplicado/);
  assert.throws(() => store.createSale(order([{ id: 'ausente', quantity: 1 }])), /Estoque/);
  assert.equal(store.get('SELECT COUNT(*) AS n FROM sales').n, 0);
  assert.equal(store.products()[0].stock, 20);
});

test('falha não baixa estoque; nova tentativa não duplica venda e permite cancelar', t => {
  const { store, tick, token } = fixture(t, { random: () => 0.8 });
  const sale = store.createSale(order());
  tick(5000);
  assert.equal(store.sale(sale.id).status, 'payment_failed');
  assert.equal(store.products()[0].available, 20);
  store.retrySale({ id: sale.id }); store.retrySale({ id: sale.id });
  assert.equal(store.get('SELECT COUNT(*) AS n FROM sales').n, 1);
  assert.equal(store.get('SELECT COUNT(*) AS n FROM payment_attempts').n, 2);
  store.cancelSale({ id: sale.id });
  tick(10000);
  assert.equal(store.sale(sale.id).status, 'cancelled');
  assert.equal(store.products()[0].stock, 20);
  assert.throws(() => store.call('adjustStock', { gateId:'G001', stock:361, reason:'Teste' }, token));
});

test('pagamento aprovado libera unidades sequencialmente em quatro pistões e baixa uma vez', t => {
  const { store, tick } = fixture(t, { random: () => 0.799999 });
  const sale = store.createSale(order([{ id:'teambee',quantity:2 },{ id:'backdev',quantity:1 },{ id:'frontdev',quantity:1 },{ id:'hivepower',quantity:1 }], 'CREDIT'));
  tick(5000); assert.equal(store.sale(sale.id).status, 'paid');
  assert.equal(store.products()[0].stock, 20);
  tick(2000); assert.equal(store.sale(sale.id).running.gate_id, 'G001');
  assert.throws(() => store.cancelSale({ id:sale.id }), /confirmado/);
  for (let step = 0; step < 20; step++) {
    tick(1000);
    assert.ok(store.get("SELECT COUNT(*) AS n FROM dispenses WHERE status='running'").n <= 1);
  }
  const final = store.sale(sale.id);
  assert.equal(final.status, 'completed'); assert.equal(final.delivered, 5);
  assert.deepEqual(store.products().map(p => p.stock), [18,19,19,19]);
  const movements = store.get('SELECT COUNT(*) AS n FROM stock_movements WHERE sale_id=?', sale.id).n;
  tick(10000); assert.equal(store.get('SELECT COUNT(*) AS n FROM stock_movements WHERE sale_id=?', sale.id).n, movements);
  const report = store.report({ view:'items', filters:{ name:'Lucas' }, sort:'subtotal_cents', direction:'asc' });
  assert.equal(report.total, 1); assert.equal(report.rows[0].unit_cents, 700); assert.equal(report.stats.total_cents, 2930);
  assert.equal(store.report({ view:'items', filters:{ unit_cents:'5,50' } }).total,1);
  assert.equal(store.report({ filters:{ created_at:new Date().toISOString().slice(0,10) } }).total,1);
});

test('estoque respeita reservas, ajustes e motivos', t => {
  const { store, token } = fixture(t);
  const sale = store.createSale(order());
  assert.throws(() => store.call('adjustStock', { gateId:'G001',stock:1,reason:'Teste' },token));
  assert.throws(() => store.call('adjustStock', { gateId:'G001',stock:20,reason:'a' },token));
  store.cancelSale({ id:sale.id });
  store.call('adjustStock', { gateId:'G001',stock:0,reason:'Descarregamento' },token);
  assert.equal(store.products()[0].stock,0);
});

test('reinício preserva dados e exige retomada administrativa, sem repetir unidades concluídas', t => {
  const f = fixture(t); const { store, tick } = f;
  const sale = store.createSale(order()); tick(5000); tick(2000); tick(1000); tick(1000);
  assert.equal(store.sale(sale.id).delivered,1);
  store.close();
  const recovered = new Store(store.filename, { clock:f.clock });
  f.track(recovered);
  assert.equal(recovered.sale(sale.id).status,'interrupted');
  assert.equal(recovered.sale(sale.id).delivered,1);
  recovered.resumeSale({ id:sale.id }); recovered.advance();
  assert.equal(recovered.sale(sale.id).running.position,1);
  assert.equal(recovered.products()[0].stock,19);
});

test('sincronização simulada é incremental, persistida e não duplica confirmações', t => {
  const { store, tick, offline, online } = fixture(t);
  offline(); assert.throws(() => store.sync(), /conexão/);
  assert.ok(store.report().rows.length === 0);
  online(); store.sync(); store.sync();
  assert.equal(store.get('SELECT COUNT(*) AS n FROM sync_runs').n,1);
  tick(3000);
  assert.equal(store.syncStatus().pending,0);
  assert.equal(store.syncStatus().last.status,'success');
  assert.equal(store.get('SELECT COUNT(*) AS n FROM simulated_receipts').n,5);
  assert.equal(store.get('SELECT COUNT(*) AS n FROM outbox WHERE synced_at IS NOT NULL').n,0);
  store.sync(); tick(5000);
  assert.equal(store.get('SELECT COUNT(*) AS n FROM simulated_receipts').n,5);
});

test('falha de sincronização mantém pendências e permite reenvio bem-sucedido', t => {
  const { store, token, tick } = fixture(t);
  store.call('updateSettings', { paymentScenario:'random',syncScenario:'failure',actuatorMs:850,intervalMs:450 },token);
  store.sync(); tick(3000); assert.equal(store.syncStatus().last.status,'failure'); assert.equal(store.syncStatus().pending,5);
  store.call('updateSettings', { paymentScenario:'random',syncScenario:'success',actuatorMs:850,intervalMs:450 },token);
  store.sync(); tick(3000); assert.equal(store.syncStatus().pending,0);
});

test('backup inclui registros confirmados e abre com integridade, sem depender de arquivos WAL', t => {
  const { store, directory, track } = fixture(t);
  const filename = path.join(directory,'backup.sqlite'); store.backup(filename);
  const copy = new Store(filename); track(copy);
  assert.equal(copy.get('PRAGMA integrity_check').integrity_check,'ok');
  assert.equal(copy.meta('machineId'), store.meta('machineId'));
  assert.equal(copy.products()[0].stock,20);
  assert.throws(() => store.backup(filename), /já existe/);
});

test('queda de rede mantém histórico e estoque local, sem aprovação fictícia após desconexão', t => {
  const { store, tick, offline } = fixture(t);
  const sale = store.createSale(order()); offline(); tick(5000);
  assert.equal(store.sale(sale.id).status,'payment_failed');
  assert.equal(store.products()[0].stock,20);
  assert.equal(store.report().total,1);
  assert.throws(() => store.createSale(order()),/conexão/);
});
