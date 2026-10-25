const { DatabaseSync } = require('node:sqlite');
const { randomUUID, randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { mkdirSync, existsSync } = require('node:fs');
const path = require('node:path');

const PRODUCTS = [
  ['teambee', 'Abelhas Robô', 550], ['backdev', 'Dev Lucas', 700],
  ['frontdev', 'Dev John', 500], ['hivepower', 'Hivetron', 630],
];
const ACTIVE = "'pending','paid','dispensing','interrupted'";
const now = () => new Date().toISOString();
const integer = (value, min, max, label) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} deve ser um inteiro entre ${min} e ${max}.`);
  return value;
};

class Store {
  constructor(filename, options = {}) {
    this.filename = filename;
    this.clock = options.clock || Date.now;
    this.random = options.random || Math.random;
    this.online = options.online || (() => true);
    this.sessions = new Map();
    this.loginFailures = [];
    mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    this.migrate();
    this.transaction(() => {
      for (const sale of this.all("SELECT id FROM sales WHERE status IN ('paid','dispensing')")) {
        this.run("UPDATE sales SET status='interrupted' WHERE id=?", sale.id);
        this.event('sale.interrupted', sale.id, this.sale(sale.id));
      }
    });
  }
  get(sql, ...args) { return this.db.prepare(sql).get(...args); }
  all(sql, ...args) { return this.db.prepare(sql).all(...args); }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  migrate() {
    const version = this.get('PRAGMA user_version').user_version;
    if (version > 1) throw new Error('Este banco foi criado por uma versão mais recente do MedalHive.');
    if (version === 1) return;
    this.transaction(() => {
      this.db.exec(`
        CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT NOT NULL,image_key TEXT NOT NULL,price_cents INTEGER NOT NULL CHECK(price_cents>0),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)));
        CREATE TABLE gates(id TEXT PRIMARY KEY,product_id TEXT NOT NULL UNIQUE REFERENCES products(id),stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0 AND stock<=maximum_stock),minimum_stock INTEGER NOT NULL DEFAULT 5 CHECK(minimum_stock>=0 AND minimum_stock<=maximum_stock),maximum_stock INTEGER NOT NULL DEFAULT 360 CHECK(maximum_stock>0));
        CREATE TABLE sales(id TEXT PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,finished_at TEXT,payment_type TEXT NOT NULL CHECK(payment_type IN('PIX','CREDIT','DEBIT')),status TEXT NOT NULL CHECK(status IN('pending','payment_failed','paid','dispensing','completed','interrupted','cancelled')),total_cents INTEGER NOT NULL CHECK(total_cents>0),demo INTEGER NOT NULL DEFAULT 1 CHECK(demo=1),next_at INTEGER);
        CREATE TABLE sale_items(id TEXT PRIMARY KEY,sale_id TEXT NOT NULL REFERENCES sales(id),product_id TEXT NOT NULL REFERENCES products(id),gate_id TEXT NOT NULL REFERENCES gates(id),name TEXT NOT NULL,unit_cents INTEGER NOT NULL CHECK(unit_cents>0),quantity INTEGER NOT NULL CHECK(quantity>0),delivered INTEGER NOT NULL DEFAULT 0 CHECK(delivered>=0 AND delivered<=quantity));
        CREATE TABLE payment_attempts(id TEXT PRIMARY KEY,sale_id TEXT NOT NULL REFERENCES sales(id),created_at TEXT NOT NULL,due_at INTEGER NOT NULL,result TEXT NOT NULL CHECK(result IN('success','failure')),status TEXT NOT NULL CHECK(status IN('pending','success','failure','cancelled')));
        CREATE TABLE dispenses(id TEXT PRIMARY KEY,sale_item_id TEXT NOT NULL REFERENCES sale_items(id),position INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN('queued','running','done')),due_at INTEGER,UNIQUE(sale_item_id,position));
        CREATE TABLE stock_movements(id TEXT PRIMARY KEY,gate_id TEXT NOT NULL REFERENCES gates(id),sale_id TEXT REFERENCES sales(id),delta INTEGER NOT NULL,balance INTEGER NOT NULL CHECK(balance>=0),reason TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE outbox(id TEXT PRIMARY KEY,machine_id TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,simulated_synced_at TEXT,synced_at TEXT);
        CREATE TABLE sync_runs(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,finished_at TEXT,status TEXT NOT NULL CHECK(status IN('pending','success','failure')),result TEXT NOT NULL CHECK(result IN('success','failure')),due_at INTEGER NOT NULL,event_ids TEXT NOT NULL,error TEXT);
        CREATE TABLE simulated_receipts(event_id TEXT PRIMARY KEY REFERENCES outbox(id),received_at TEXT NOT NULL);
        CREATE INDEX sale_date_idx ON sales(created_at);
        CREATE INDEX sale_status_idx ON sales(status);
        CREATE INDEX sale_items_order_idx ON sale_items(sale_id);
        CREATE INDEX movement_date_idx ON stock_movements(created_at);
        CREATE INDEX outbox_pending_idx ON outbox(simulated_synced_at,created_at);
        CREATE VIEW sale_item_report AS SELECT s.id AS sale_id,s.created_at,s.payment_type,s.status,s.demo,s.total_cents,i.product_id,i.name,i.quantity,i.delivered,i.unit_cents,i.quantity*i.unit_cents AS subtotal_cents FROM sales s JOIN sale_items i ON i.sale_id=s.id;
        CREATE VIEW inventory AS SELECT p.id,p.name,p.image_key,p.price_cents,p.active,g.id AS gate_id,g.stock,g.minimum_stock,g.maximum_stock,COALESCE((SELECT SUM(i.quantity-i.delivered) FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.gate_id=g.id AND s.status IN (${ACTIVE})),0) AS reserved FROM products p JOIN gates g ON g.product_id=p.id;
      `);
      this.set('machineId', randomUUID());
      this.set('settings', JSON.stringify({ paymentScenario: 'random', syncScenario: 'random', actuatorMs: 850, intervalMs: 450 }));
      PRODUCTS.forEach(([id, name, price], index) => {
        this.run('INSERT INTO products(id,name,image_key,price_cents) VALUES(?,?,?,?)', id, name, id, price);
        this.run('INSERT INTO gates(id,product_id) VALUES(?,?)', `G00${index + 1}`, id);
      });
      this.event('machine.registered', this.meta('machineId'), { name: 'MedalHive', schemaVersion: 1, demo: true, catalog: this.products() });
      this.db.exec('PRAGMA user_version=1');
    });
  }
  meta(key) { return this.get('SELECT value FROM meta WHERE key=?', key)?.value; }
  set(key, value) { this.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value)); }
  settings() { return JSON.parse(this.meta('settings')); }
  event(kind, entityId, payload) {
    this.run('INSERT INTO outbox(id,machine_id,kind,entity_id,payload,created_at) VALUES(?,?,?,?,?,?)', randomUUID(), this.meta('machineId'), kind, entityId, JSON.stringify(payload), now());
  }
  session(token) {
    const expires = this.sessions.get(token);
    if (!expires || expires < this.clock()) { this.sessions.delete(token); throw new Error('Sessão expirada. Entre novamente como administrador.'); }
    this.sessions.set(token, this.clock() + 30 * 60_000);
  }
  credentials(username, password) {
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) throw new Error('Usuário: use de 3 a 40 letras, números, ponto, hífen ou sublinhado.');
    if (typeof password !== 'string' || password.length < 6 || password.length > 128) throw new Error('A senha deve ter de 6 a 128 caracteres.');
    const salt = randomBytes(16).toString('hex');
    this.set('admin', JSON.stringify({ username, salt, hash: scryptSync(password, salt, 64).toString('hex') }));
  }
  setup({ username, password }) {
    if (this.meta('admin')) throw new Error('O administrador já foi configurado.');
    this.transaction(() => this.credentials(username, password));
    return this.login({ username, password });
  }
  login({ username, password }) {
    this.loginFailures = this.loginFailures.filter(time => time > this.clock() - 60_000);
    if (this.loginFailures.length >= 5) throw new Error('Muitas tentativas. Aguarde um minuto.');
    const admin = JSON.parse(this.meta('admin') || 'null');
    if (!admin || typeof password !== 'string' || password.length > 128 || username !== admin.username || !timingSafeEqual(scryptSync(password, admin.salt, 64), Buffer.from(admin.hash, 'hex'))) {
      this.loginFailures.push(this.clock()); throw new Error('Usuário ou senha inválidos.');
    }
    this.loginFailures = [];
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, this.clock() + 30 * 60_000);
    return { token, username: admin.username };
  }
  products() { return this.all('SELECT *,stock-reserved AS available FROM inventory WHERE active=1 ORDER BY gate_id'); }
  sale(id) {
    const sale = this.get('SELECT * FROM sales WHERE id=?', id);
    if (!sale) throw new Error('Pedido não encontrado.');
    const items = this.all('SELECT * FROM sale_items WHERE sale_id=? ORDER BY gate_id', id);
    const running = this.get("SELECT d.*,i.name,i.gate_id FROM dispenses d JOIN sale_items i ON i.id=d.sale_item_id WHERE i.sale_id=? AND d.status='running'", id);
    return { ...sale, items, running: running || null, delivered: items.reduce((s, i) => s + i.delivered, 0), units: items.reduce((s, i) => s + i.quantity, 0) };
  }
  activeSale() { const row = this.get(`SELECT id FROM sales WHERE status IN (${ACTIVE}) ORDER BY created_at LIMIT 1`); return row ? this.sale(row.id) : null; }
  info() { return { machineId: this.meta('machineId'), setupRequired: !this.meta('admin'), demo: true, activeSale: this.activeSale(), online: this.online() }; }
  createSale({ items, paymentType, requestId }) {
    if (typeof requestId !== 'string' || requestId.length < 16 || requestId.length > 100) throw new Error('Identificador de pedido inválido.');
    const previous = this.get('SELECT id FROM sales WHERE request_id=?', requestId);
    if (previous) return this.sale(previous.id);
    if (!this.online()) throw new Error('Sem conexão de rede. Tente o pagamento quando a conexão voltar.');
    if (!['PIX', 'CREDIT', 'DEBIT'].includes(paymentType)) throw new Error('Forma de pagamento inválida.');
    if (!Array.isArray(items) || items.length < 1 || items.length > 4) throw new Error('Selecione ao menos uma medalha.');
    return this.transaction(() => {
      if (!this.meta('admin')) throw new Error('Configure o administrador e abasteça os pistões primeiro.');
      if (this.activeSale()) throw new Error('Existe uma compra em andamento. Retome-a na tela inicial.');
      const catalog = this.products();
      const unique = new Set();
      const selected = items.map(item => {
        if (unique.has(item.id)) throw new Error('Produto duplicado no pedido.');
        unique.add(item.id);
        const product = catalog.find(p => p.id === item.id);
        integer(item.quantity, 1, 100, 'Quantidade');
        if (!product || item.quantity > product.available) throw new Error('Estoque insuficiente. Atualize a seleção.');
        return { ...product, quantity: item.quantity };
      });
      const id = randomUUID();
      this.run("INSERT INTO sales(id,request_id,created_at,payment_type,status,total_cents) VALUES(?,?,?,?,'pending',?)", id, requestId, now(), paymentType, selected.reduce((sum, p) => sum + p.price_cents * p.quantity, 0));
      selected.forEach(p => this.run('INSERT INTO sale_items(id,sale_id,product_id,gate_id,name,unit_cents,quantity) VALUES(?,?,?,?,?,?,?)', randomUUID(), id, p.id, p.gate_id, p.name, p.price_cents, p.quantity));
      this.beginAttempt(id);
      this.event('sale.created', id, this.sale(id));
      return this.sale(id);
    });
  }
  outcome(scenario) { return scenario === 'success' || (scenario === 'random' && this.random() < 0.8) ? 'success' : 'failure'; }
  beginAttempt(saleId) {
    this.run("INSERT INTO payment_attempts(id,sale_id,created_at,due_at,result,status) VALUES(?,?,?,?,?,'pending')", randomUUID(), saleId, now(), this.clock() + 5000, this.outcome(this.settings().paymentScenario));
  }
  retrySale({ id }) {
    return this.transaction(() => {
      const sale = this.sale(id);
      if (sale.status === 'pending') return sale;
      if (sale.status !== 'payment_failed') throw new Error('Este pedido não pode receber outra tentativa de pagamento.');
      if (this.activeSale()) throw new Error('Existe outra compra em andamento.');
      const products = this.products();
      if (sale.items.some(i => (products.find(p => p.id === i.product_id)?.available || 0) < i.quantity)) throw new Error('Estoque indisponível para repetir o pedido.');
      this.run("UPDATE sales SET status='pending',finished_at=NULL WHERE id=?", id);
      this.beginAttempt(id);
      this.event('sale.retry', id, this.sale(id));
      return this.sale(id);
    });
  }
  cancelSale({ id }) {
    return this.transaction(() => {
      const sale = this.sale(id);
      if (sale.status === 'cancelled') return sale;
      if (!['pending', 'payment_failed'].includes(sale.status)) throw new Error('Pagamento confirmado. Aguarde a entrega ou solicite manutenção.');
      this.run("UPDATE payment_attempts SET status='cancelled' WHERE sale_id=? AND status='pending'", id);
      this.run("UPDATE sales SET status='cancelled',finished_at=? WHERE id=?", now(), id);
      this.event('sale.cancelled', id, this.sale(id));
      return this.sale(id);
    });
  }
  advance() {
    const time = this.clock();
    this.transaction(() => {
      for (const attempt of this.all("SELECT * FROM payment_attempts WHERE status='pending' AND due_at<=?", time)) {
        if (this.sale(attempt.sale_id).status !== 'pending') continue;
        this.run('UPDATE payment_attempts SET status=result WHERE id=?', attempt.id);
        const success = attempt.result === 'success' && this.online();
        if (!success) this.run("UPDATE payment_attempts SET result='failure',status='failure' WHERE id=?", attempt.id);
        this.run('UPDATE sales SET status=?,next_at=?,finished_at=? WHERE id=?', success ? 'paid' : 'payment_failed', success ? time + 2000 : null, success ? null : now(), attempt.sale_id);
        this.event(success ? 'payment.approved' : 'payment.failed', attempt.sale_id, this.sale(attempt.sale_id));
        if (success) this.sale(attempt.sale_id).items.forEach(item => {
          for (let index = 0; index < item.quantity; index++) this.run("INSERT INTO dispenses(id,sale_item_id,position,status) VALUES(?,?,?,'queued')", randomUUID(), item.id, index);
        });
      }
      for (const sale of this.all("SELECT * FROM sales WHERE status IN('paid','dispensing') AND next_at<=?", time)) {
        const running = this.get("SELECT d.*,i.gate_id FROM dispenses d JOIN sale_items i ON i.id=d.sale_item_id WHERE i.sale_id=? AND d.status='running'", sale.id);
        if (running) {
          const gate = this.get('SELECT * FROM gates WHERE id=?', running.gate_id);
          if (gate.stock < 1) throw new Error('Estoque inconsistente durante a dispensa.');
          this.run('UPDATE gates SET stock=stock-1 WHERE id=?', gate.id);
          this.run('UPDATE sale_items SET delivered=delivered+1 WHERE id=?', running.sale_item_id);
          this.run("UPDATE dispenses SET status='done' WHERE id=?", running.id);
          const movement = { id: randomUUID(), gateId: gate.id, saleId: sale.id, delta: -1, balance: gate.stock - 1, reason: 'Dispensa simulada', createdAt: now() };
          this.run('INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?)', movement.id, movement.gateId, movement.saleId, movement.delta, movement.balance, movement.reason, movement.createdAt);
          this.event('stock.changed', movement.id, movement);
          this.event('dispense.completed', running.id, this.sale(sale.id));
          this.run('UPDATE sales SET next_at=? WHERE id=?', time + this.settings().intervalMs, sale.id);
          continue;
        }
        const queued = this.get("SELECT d.* FROM dispenses d JOIN sale_items i ON i.id=d.sale_item_id WHERE i.sale_id=? AND d.status='queued' ORDER BY i.gate_id,d.position LIMIT 1", sale.id);
        if (queued) {
          this.run("UPDATE dispenses SET status='running',due_at=? WHERE id=?", time + this.settings().actuatorMs, queued.id);
          this.run("UPDATE sales SET status='dispensing',next_at=? WHERE id=?", time + this.settings().actuatorMs, sale.id);
        } else {
          this.run("UPDATE sales SET status='completed',finished_at=?,next_at=NULL WHERE id=?", now(), sale.id);
          this.event('sale.completed', sale.id, this.sale(sale.id));
        }
      }
      for (const sync of this.all("SELECT * FROM sync_runs WHERE status='pending' AND due_at<=?", time)) {
        const success = sync.result === 'success' && this.online();
        if (success) JSON.parse(sync.event_ids).forEach(id => {
          this.run('INSERT OR IGNORE INTO simulated_receipts VALUES(?,?)', id, now());
          this.run('UPDATE outbox SET simulated_synced_at=? WHERE id=?', now(), id);
        });
        this.run('UPDATE sync_runs SET status=?,finished_at=?,error=? WHERE id=?', success ? 'success' : 'failure', now(), success ? null : 'Falha simulada de comunicação. Os dados continuam salvos; tente novamente.', sync.id);
      }
    });
  }
  adjustStock({ gateId, stock, reason }) {
    return this.transaction(() => {
      const gate = this.products().find(p => p.gate_id === gateId);
      if (!gate) throw new Error('Pistão não encontrado.');
      integer(stock, gate.reserved, gate.maximum_stock, 'Estoque');
      if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 200) throw new Error('Informe um motivo de 3 a 200 caracteres.');
      if (stock === gate.stock) throw new Error('O estoque não foi alterado.');
      const id = randomUUID();
      this.run('UPDATE gates SET stock=? WHERE id=?', stock, gateId);
      this.run('INSERT INTO stock_movements VALUES(?,?,NULL,?,?,?,?)', id, gateId, stock - gate.stock, stock, reason.trim(), now());
      this.event('stock.adjusted', id, { gateId, productId: gate.id, delta: stock - gate.stock, balance: stock, reason: reason.trim() });
      return this.products();
    });
  }
  resumeSale({ id }) {
    if (this.sale(id).status !== 'interrupted') throw new Error('Não existe uma dispensa interrompida neste pedido.');
    return this.transaction(() => {
      this.run("UPDATE dispenses SET status='queued',due_at=NULL WHERE sale_item_id IN(SELECT id FROM sale_items WHERE sale_id=?) AND status='running'", id);
      this.run("UPDATE sales SET status='dispensing',next_at=? WHERE id=?", this.clock(), id);
      this.event('sale.resumed', id, this.sale(id));
      return this.sale(id);
    });
  }
  updateSettings(settings) {
    if (!['random', 'success', 'failure'].includes(settings.paymentScenario) || !['random', 'success', 'failure'].includes(settings.syncScenario)) throw new Error('Cenário de simulação inválido.');
    integer(settings.actuatorMs, 200, 10000, 'Tempo de acionamento');
    integer(settings.intervalMs, 0, 10000, 'Intervalo');
    const valid = { paymentScenario: settings.paymentScenario, syncScenario: settings.syncScenario, actuatorMs: settings.actuatorMs, intervalMs: settings.intervalMs };
    this.set('settings', JSON.stringify(valid));
    return valid;
  }
  syncStatus() {
    const pending = this.get('SELECT COUNT(*) AS total FROM outbox WHERE simulated_synced_at IS NULL').total;
    const last = this.get('SELECT * FROM sync_runs ORDER BY rowid DESC LIMIT 1');
    return { pending, last: last ? { ...last, count: JSON.parse(last.event_ids).length, event_ids: undefined, result: undefined } : null };
  }
  sync() {
    const pendingRun = this.get("SELECT id FROM sync_runs WHERE status='pending'");
    if (pendingRun) return this.syncStatus();
    if (!this.online()) throw new Error('Sem conexão de rede. O histórico local permanece disponível.');
    const ids = this.all('SELECT id FROM outbox WHERE simulated_synced_at IS NULL ORDER BY rowid LIMIT 250').map(row => row.id);
    if (!ids.length) return this.syncStatus();
    this.run("INSERT INTO sync_runs(id,created_at,status,result,due_at,event_ids) VALUES(?,?,'pending',?,?,?)", randomUUID(), now(), this.outcome(this.settings().syncScenario), this.clock() + 2500, JSON.stringify(ids));
    return this.syncStatus();
  }
  report({ filters = {}, sort = 'created_at', direction = 'desc', page = 1, pageSize = 5, view = 'sales' } = {}) {
    integer(page, 1, 1_000_000, 'Página'); integer(pageSize, 1, 20, 'Linhas por página');
    const columns = ['id','created_at','payment_type','status','total_cents'];
    if (view === 'items') columns.push('name','quantity','unit_cents','subtotal_cents');
    if (!columns.includes(sort) || !['asc','desc'].includes(direction)) throw new Error('Ordenação inválida.');
    const params = [];
    const expressions = [];
    Object.entries(filters).forEach(([column, value]) => {
      if (!columns.includes(column) || typeof value !== 'string' || !value.trim()) return;
      if (value.length > 100) throw new Error('Filtro muito longo.');
      const amount = ['total_cents','unit_cents','subtotal_cents'].includes(column);
      const expression = amount ? `printf('%.2f',${column}/100.0)` : `CAST(${column} AS TEXT)`;
      const escaped = `%${(amount ? value.trim().replaceAll(',', '.') : value.trim()).replace(/[\\%_]/g, '\\$&')}%`;
      if (column === 'created_at') {
        expressions.push(`(${expression} LIKE ? ESCAPE '\\' OR strftime('%d/%m/%Y %H:%M',created_at,'localtime') LIKE ? ESCAPE '\\')`);
        params.push(escaped, escaped);
      } else { expressions.push(`${expression} LIKE ? ESCAPE '\\'`); params.push(escaped); }
    });
    const where = expressions.length ? `WHERE ${expressions.join(' AND ')}` : '';
    const table = view === 'items' ? '(SELECT sale_id AS id,* FROM sale_item_report)' : 'sales';
    const total = this.get(`SELECT COUNT(*) AS total FROM ${table} ${where}`, ...params).total;
    const rows = this.all(`SELECT * FROM ${table} ${where} ORDER BY ${sort} ${direction},id ASC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
    const stats = this.get("SELECT COUNT(*) AS sales,COALESCE(SUM(total_cents),0) AS total_cents FROM sales WHERE status='completed'");
    return { rows, total, page, pageSize, stats, sync: this.syncStatus() };
  }
  saleDetails({ id }) { return { ...this.sale(id), attempts: this.all('SELECT id,created_at,status FROM payment_attempts WHERE sale_id=? ORDER BY rowid', id) }; }
  backup(destination) {
    if (existsSync(destination)) throw new Error('O arquivo de destino já existe. Escolha outro nome.');
    mkdirSync(path.dirname(destination), { recursive: true });
    this.db.prepare('VACUUM INTO ?').run(destination);
    return destination;
  }
  close() { this.sessions.clear(); this.db.close(); }
  call(method, payload = {}, token) {
    const publicMethods = ['info','products','createSale','retrySale','cancelSale','setup','login'];
    const adminMethods = ['adjustStock','resumeSale','updateSettings','report','saleDetails','sync','syncStatus'];
    if (method === 'sale') return this.sale(payload.id);
    if (method === 'logout') { this.sessions.delete(token); return true; }
    if (method === 'adminInfo') { this.session(token); return { ...this.info(), settings: this.settings(), databasePath: this.filename, movements: this.all('SELECT m.*,p.name FROM stock_movements m JOIN gates g ON g.id=m.gate_id JOIN products p ON p.id=g.product_id ORDER BY m.rowid DESC LIMIT 5') }; }
    if (!publicMethods.includes(method) && !adminMethods.includes(method)) throw new Error('Operação desconhecida.');
    if (adminMethods.includes(method)) this.session(token);
    return this[method](payload);
  }
}
module.exports = { Store, PRODUCTS };
