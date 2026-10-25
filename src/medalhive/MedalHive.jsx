import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { api, setToken } from './api';
import { banner, images, money, dateTime, paymentNames, statusNames } from './catalog';
import { TouchKeyboard } from './TouchKeyboard';

function Button({ children, secondary, danger, className = '', ...props }) {
  return <button className={`button ${secondary ? 'secondary' : ''} ${danger ? 'danger' : ''} ${className}`} type="button" {...props}>{children}</button>;
}
function Title({ eyebrow, children, detail }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow || 'MEDALHIVE'}</span><h1>{children}</h1></div>{detail && <p>{detail}</p>}</div>;
}
function Pager({ page, pages, change, children }) {
  return <div className="pager"><Button secondary disabled={page <= 1} onClick={() => change(page - 1)} aria-label="Página anterior">←</Button><span>{children || `${page} / ${Math.max(1, pages)}`}</span><Button secondary disabled={page >= pages} onClick={() => change(page + 1)} aria-label="Próxima página">→</Button></div>;
}
function useCapacity(ref, rowHeight = 66, overhead = 0, maximum = 10) {
  const [capacity, setCapacity] = useState(1);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setCapacity(Math.max(1, Math.min(maximum, Math.floor((entry.contentRect.height - overhead) / rowHeight)))));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, rowHeight, overhead, maximum]);
  return capacity;
}

export function MedalHive() {
  const navigate = useNavigate();
  const location = useLocation();
  const [info, setInfo] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [cart, setCart] = useState({});
  const [notice, setNotice] = useState('');
  const [fatal, setFatal] = useState('');
  const [target, setTarget] = useState(null);
  const [connected, setConnected] = useState(navigator.onLine);
  const requestId = useRef(crypto.randomUUID());
  const path = location.pathname;
  const refresh = useCallback(async () => { const data = await api('info'); setInfo(data); return data; }, []);
  useEffect(() => { refresh().catch(error => setFatal(error.message)); }, [refresh]);
  useEffect(() => {
    const online = () => setConnected(navigator.onLine);
    window.addEventListener('online', online); window.addEventListener('offline', online);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', online); };
  }, []);
  useEffect(() => { setTarget(null); setNotice(''); }, [path]);
  useEffect(() => {
    if (!target) return;
    const observer = new MutationObserver(() => { if (!target.isConnected) setTarget(null); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [target]);
  useEffect(() => {
    if (!['/vendas','/resumo','/pagamento'].includes(path)) return;
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => { setCart({}); navigate('/'); }, 90_000); };
    reset(); window.addEventListener('pointerdown', reset); window.addEventListener('keydown', reset);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', reset); window.removeEventListener('keydown', reset); };
  }, [path, navigate]);
  const notify = useCallback(error => setNotice(error instanceof Error ? error.message : error), []);
  const home = () => { setCart({}); requestId.current = crypto.randomUUID(); refresh().catch(notify); navigate('/'); };
  const logout = async () => { await api('logout'); setToken(null); setAdmin(null); home(); };
  const ctx = { navigate, info, refresh, cart, setCart, requestId, notify, home, admin };
  let page;
  if (fatal) page = <section className="center-page"><h1>Não foi possível abrir o MedalHive</h1><p role="alert">{fatal}</p><Button onClick={() => window.location.reload()}>Tentar novamente</Button></section>;
  else if (!info) page = <section className="center-page"><div className="spinner" /><p>Preparando seu MedalHive…</p></section>;
  else if (path === '/login') page = <Login {...ctx} onLogin={value => { setAdmin(value); refresh().catch(notify); navigate('/admin'); }} />;
  else if (path.startsWith('/admin')) page = !admin ? <Navigate to="/login" replace /> : path === '/admin/estoque' ? <Inventory {...ctx} /> : path === '/admin/relatorios' ? <Reports {...ctx} /> : path === '/admin/configuracoes' ? <Settings {...ctx} /> : <Admin {...ctx} logout={logout} />;
  else if (path === '/vendas') page = <Catalog {...ctx} />;
  else if (path === '/resumo') page = <Summary {...ctx} />;
  else if (path === '/pagamento') page = <Payment {...ctx} />;
  else if (path.startsWith('/pedido/')) page = <Order {...ctx} id={path.split('/')[2]} />;
  else page = <Home {...ctx} />;
  return (
    <div className={`app-shell ${target ? 'keyboard-open' : ''}`} onFocusCapture={event => { if (event.target.matches('input[data-touch],textarea[data-touch]')) setTarget(event.target); }}>
      <header className="brand-header"><img src={banner} alt="MedalHive — medalhas comemorativas" /><div className="utility-bar"><span className="demo-label"><i /> Ambiente de demonstração</span><span className={`network ${connected ? '' : 'offline'}`}>{connected ? '● Rede disponível' : '● Sem rede · dados locais'}</span><button type="button" className="text-button" onClick={() => navigate(admin ? '/admin' : '/login')}>{admin ? 'Administração' : 'Administrador'}</button></div></header>
      {notice && <div className="notice" role="alert"><span>{notice}</span><button className="text-button" onClick={() => setNotice('')} aria-label="Fechar mensagem">×</button></div>}
      <main className="page" key={path}>{page}</main>
      <TouchKeyboard target={target} close={() => setTarget(null)} />
    </div>
  );
}

function Home({ navigate, info, refresh, notify, setCart, requestId }) {
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    try {
      const data = await refresh();
      if (data.activeSale) { navigate(`/pedido/${data.activeSale.id}`); return; }
      setCart({}); requestId.current = crypto.randomUUID(); navigate('/vendas');
    } catch (error) { notify(error); } finally { setBusy(false); }
  }
  return <section className="home-page"><div className="home-copy"><span className="eyebrow">UMA LEMBRANÇA QUE FICA</span><h1>Pequenas medalhas.<br /><em>Grandes histórias.</em></h1><p>Escolha seus modelos favoritos e leve um pouco da colmeia com você.</p><Button onClick={start} disabled={busy || info.setupRequired}>{info.activeSale ? 'Retomar compra em andamento →' : 'Toque para começar →'}</Button>{info.setupRequired ? <p className="hint">Primeiro uso: acesse Administrador para configurar o acesso e abastecer os pistões.</p> : <span className="hint">PIX · Crédito · Débito — pagamentos simulados</span>}</div><div className="home-coins" aria-hidden="true"><img src={images.teambee} /><img src={images.hivepower} /></div></section>;
}

function Login({ info, navigate, notify, onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    if (info.setupRequired && password !== confirm) { notify('As senhas não coincidem.'); return; }
    setBusy(true);
    try { const result = await api(info.setupRequired ? 'setup' : 'login', { username, password }); setToken(result.token); setPassword(''); setConfirm(''); onLogin(result.username); }
    catch (error) { notify(error); } finally { setBusy(false); }
  }
  return <section className="login-page"><Title eyebrow="ÁREA RESTRITA" detail={info.setupRequired ? 'Crie o acesso administrativo desta máquina.' : 'Estoque, relatórios e configurações locais.'}>{info.setupRequired ? 'Prepare sua colmeia' : 'Bem-vindo de volta'}</Title><form className="login-form" onSubmit={submit}>
    <label>Usuário<input data-touch autoComplete="username" value={username} maxLength={40} onChange={event => setUsername(event.target.value)} required /></label>
    <label>Senha<input data-touch type="password" autoComplete={info.setupRequired ? 'new-password' : 'current-password'} value={password} minLength={6} maxLength={128} placeholder="Mínimo de 6 caracteres" onChange={event => setPassword(event.target.value)} required /></label>
    {info.setupRequired && <label>Confirme a senha<input data-touch type="password" autoComplete="new-password" value={confirm} minLength={6} maxLength={128} onChange={event => setConfirm(event.target.value)} required /></label>}
    <div className="actions"><Button secondary onClick={() => navigate('/')}>Voltar</Button><Button type="submit" disabled={busy}>{busy ? 'Aguarde…' : info.setupRequired ? 'Criar acesso' : 'Entrar →'}</Button></div>
  </form></section>;
}

function Catalog({ cart, setCart, navigate, notify, home }) {
  const [products, setProducts] = useState(null);
  const [page, setPage] = useState(1);
  const ref = useRef();
  const [capacity, setCapacity] = useState(2);
  useEffect(() => { api('products').then(setProducts).catch(notify); }, [notify]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const columns = width >= 1020 ? 4 : width >= 520 ? 2 : 1;
      const rows = height >= 560 ? 2 : 1;
      setCapacity(Math.min(4, columns * rows));
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const total = (products || []).reduce((sum, p) => sum + p.price_cents * (cart[p.id] || 0), 0);
  const units = Object.values(cart).reduce((sum, value) => sum + value, 0);
  const pages = Math.ceil((products?.length || 0) / capacity);
  const current = Math.min(page, Math.max(1, pages));
  return <section className="flow-page"><Title eyebrow="01 / SUA ESCOLHA" detail="Toque em + ou − para escolher as quantidades.">Escolha suas medalhas</Title><div ref={ref} className={`product-grid capacity-${capacity}`}>
    {!products && <p>Carregando catálogo…</p>}
    {products?.slice((current - 1) * capacity, current * capacity).map(p => <article key={p.id} className={`product-card ${p.available === 0 ? 'unavailable' : ''}`}><img src={images[p.image_key]} alt={`Medalha ${p.name}`} /><div className="product-info"><span className="eyebrow">EDIÇÃO HIVETRON · {p.gate_id}</span><h2>{p.name}</h2><strong className="price">{money(p.price_cents)}</strong><small>{p.available ? `${p.available} disponíveis` : 'Aguardando abastecimento'}</small><div className="quantity"><Button secondary aria-label={`Diminuir ${p.name}`} disabled={!cart[p.id]} onClick={() => setCart(value => ({ ...value, [p.id]: Math.max(0, (value[p.id] || 0) - 1) }))}>−</Button><output aria-label={`Quantidade de ${p.name}`}>{cart[p.id] || 0}</output><Button aria-label={`Adicionar ${p.name}`} disabled={(cart[p.id] || 0) >= Math.min(100, p.available)} onClick={() => setCart(value => ({ ...value, [p.id]: (value[p.id] || 0) + 1 }))}>+</Button></div></div></article>)}
  </div>{pages > 1 && <Pager page={current} pages={pages} change={setPage} />}<footer className="page-actions"><Button secondary onClick={home}>← Início</Button><div className="order-total"><small>{units} {units === 1 ? 'medalha' : 'medalhas'}</small><strong>{money(total)}</strong></div><Button disabled={!units} onClick={() => navigate('/resumo')}>Conferir pedido →</Button></footer></section>;
}

function useCartItems(cart, notify) {
  const [products, setProducts] = useState([]);
  useEffect(() => { api('products').then(setProducts).catch(notify); }, [notify]);
  return products.filter(p => cart[p.id] > 0).map(p => ({ ...p, quantity: cart[p.id] }));
}
function Summary({ cart, navigate, notify }) {
  const items = useCartItems(cart, notify);
  const ref = useRef();
  const capacity = useCapacity(ref, 80, 0, 4);
  const [page, setPage] = useState(1);
  if (!Object.values(cart).some(Boolean)) return <Navigate to="/vendas" replace />;
  return <section className="flow-page"><Title eyebrow="02 / CONFERÊNCIA" detail="Tudo certo? Confira os modelos e as quantidades.">Seu pedido, do seu jeito</Title><div ref={ref} className="summary-list">{items.slice((page - 1) * capacity, page * capacity).map(p => <article className="summary-row" key={p.id}><img src={images[p.image_key]} alt="" /><div><h2>{p.name}</h2><span>{p.quantity} × {money(p.price_cents)}</span></div><strong>{money(p.quantity * p.price_cents)}</strong></article>)}</div>{items.length > capacity && <Pager page={page} pages={Math.ceil(items.length / capacity)} change={setPage} />}<footer className="page-actions"><Button secondary onClick={() => navigate('/vendas')}>← Alterar pedido</Button><div className="order-total"><small>Total do pedido</small><strong>{money(items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0))}</strong></div><Button disabled={!items.length} onClick={() => navigate('/pagamento')}>Ir para pagamento →</Button></footer></section>;
}
function Payment({ cart, requestId, navigate, notify }) {
  const items = useCartItems(cart, notify);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  if (!Object.values(cart).some(Boolean)) return <Navigate to="/vendas" replace />;
  async function pay(paymentType) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { const sale = await api('createSale', { items: items.map(p => ({ id: p.id, quantity: p.quantity })), paymentType, requestId: requestId.current }); navigate(`/pedido/${sale.id}`); }
    catch (error) { notify(error); } finally { lock.current = false; setBusy(false); }
  }
  return <section className="flow-page"><Title eyebrow="03 / PAGAMENTO" detail="Esta demonstração não realiza cobranças.">Como deseja pagar?</Title><div className="payment-options">{[['PIX','◇','PIX','QR Code na tela'],['CREDIT','▰','Crédito','Pagamento na maquininha'],['DEBIT','▰','Débito','Pagamento na maquininha']].map(([id, icon, name, subtitle]) => <button className="payment-card" key={id} disabled={busy || !items.length} onClick={() => pay(id)}><span className="payment-icon">{icon}</span><h2>{name}</h2><p>{subtitle}</p><span className="eyebrow">SIMULADO →</span></button>)}</div><footer className="page-actions"><Button secondary disabled={busy} onClick={() => navigate('/resumo')}>← Conferir pedido</Button><div className="order-total"><small>Total a pagar</small><strong>{money(items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0))}</strong></div><span className="hint">{busy ? 'Preparando pagamento…' : 'Escolha uma opção acima'}</span></footer></section>;
}

function Order({ id, navigate, notify, home, setCart }) {
  const [sale, setSale] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const poll = () => api('sale', { id }).then(data => { if (active) { setSale(data); setError(''); } }).catch(err => { if (active) setError(err.message); });
    poll(); const timer = setInterval(poll, 300);
    return () => { active = false; clearInterval(timer); };
  }, [id]);
  useEffect(() => {
    if (sale?.status !== 'completed') return;
    setCart({}); const timer = setTimeout(home, 5000);
    return () => clearTimeout(timer);
  // home closes over UI state; order status, not every poll, starts this timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale?.status, setCart]);
  async function action(method) {
    if (busy) return;
    setBusy(true); try { const result = await api(method, { id }); setSale(result); if (method === 'cancelSale') home(); } catch (err) { notify(err); } finally { setBusy(false); }
  }
  if (error) return <section className="center-page"><h1>Não foi possível consultar o pedido</h1><p role="alert">{error}</p><p>O processamento continua salvo localmente. Aguarde a reconexão.</p><Button secondary onClick={() => navigate('/')}>Tela inicial</Button></section>;
  if (!sale) return <section className="center-page"><div className="spinner" /><p>Consultando pedido…</p></section>;
  const status = sale.status;
  const success = ['paid','dispensing','completed'].includes(status);
  const heading = { pending: 'Aguardando pagamento', payment_failed: 'Não conseguimos confirmar', paid: 'Pagamento confirmado!', dispensing: 'Suas medalhas estão chegando', completed: 'Tudo pronto. Obrigado!', interrupted: 'Entrega pausada', cancelled: 'Pedido cancelado' }[status];
  return <section className={`order-page state-${status}`}><Title eyebrow={`PEDIDO ${id.slice(0,8).toUpperCase()} · DEMONSTRAÇÃO`} detail={`${paymentNames[sale.payment_type]} · ${money(sale.total_cents)}`}>{heading}</Title><div className="order-stage">
    {status === 'pending' && <>{sale.payment_type === 'PIX' ? <div className="qr-block"><QRCode value={`MEDALHIVE:DEMONSTRACAO:SEM-VALOR-PARA-PAGAMENTO:${id}`} size={220} /><strong>QR Code de demonstração</strong><small>Não realize nenhum pagamento real.</small></div> : <div className="terminal-illustration"><span>▰</span><strong>{paymentNames[sale.payment_type]}</strong><small>Maquininha simulada</small></div>}<div className="waiting-text"><div className="spinner" /><p>Simulando a comunicação de pagamento…</p><small>O resultado será apresentado em instantes.</small></div></>}
    {status === 'payment_failed' && <div className="stage-message"><span className="status-symbol failure">!</span><h2>Falha simulada de comunicação</h2><p>Nenhuma cobrança foi realizada e nenhuma medalha foi liberada.</p><p>Você pode tentar novamente ou cancelar este pedido.</p></div>}
    {success && <div className="stage-message"><span className={`status-symbol ${status === 'dispensing' ? 'pulsing' : ''}`}>{status === 'dispensing' ? '⬡' : '✓'}</span><h2>{status === 'completed' ? 'Retire suas medalhas no dispensador' : status === 'paid' ? 'Preparando a liberação das medalhas' : sale.running ? `${sale.running.name} · ${sale.running.gate_id}` : 'Aguardando o próximo acionamento'}</h2><p>{status === 'completed' ? 'Retornaremos à tela inicial em instantes.' : 'Aguarde a finalização de todos os acionamentos.'}</p><progress max={sale.units} value={sale.delivered} /><strong>{sale.delivered} de {sale.units} medalhas {status === 'completed' ? 'entregues' : 'liberadas'}</strong><small>Dispensa simulada · nenhum equipamento físico conectado</small></div>}
    {status === 'interrupted' && <div className="stage-message"><span className="status-symbol failure">!</span><h2>A aplicação foi interrompida durante a entrega</h2><p>{sale.delivered} de {sale.units} medalhas registradas. O pedido permanece salvo.</p><p>Solicite ao administrador a retomada da simulação.</p></div>}
    {status === 'cancelled' && <div className="stage-message"><h2>Seu pedido foi cancelado</h2><p>Nenhuma medalha será liberada.</p></div>}
  </div><footer className="page-actions"><span className="hint">{status === 'pending' ? 'O estoque está reservado para este pedido.' : 'Operação registrada no histórico local.'}</span><div className="actions">{['pending','payment_failed'].includes(status) && <Button secondary disabled={busy} onClick={() => action('cancelSale')}>Cancelar pedido</Button>}{status === 'payment_failed' && <Button disabled={busy} onClick={() => action('retrySale')}>Tentar novamente →</Button>}{['completed','cancelled'].includes(status) && <Button onClick={home}>Voltar ao início →</Button>}{status === 'interrupted' && <Button secondary onClick={() => navigate('/login')}>Acesso administrativo</Button>}</div></footer></section>;
}

function Admin({ navigate, admin, info, refresh, notify, logout }) {
  useEffect(() => { refresh().catch(notify); }, [refresh, notify]);
  const active = info.activeSale;
  return <section className="flow-page"><Title eyebrow="ADMINISTRAÇÃO LOCAL" detail={`Olá, ${admin}. Seus dados ficam salvos neste computador.`}>Sua colmeia em dia</Title>{active && <div className="inline-message">Compra {active.id.slice(0,8)}: {statusNames[active.status]} <Button secondary onClick={async () => { try { if (active.status === 'interrupted') await api('resumeSale', { id: active.id }); navigate(`/pedido/${active.id}`); } catch (error) { notify(error); } }}>{active.status === 'interrupted' ? 'Retomar simulação' : 'Acompanhar compra'}</Button></div>}<div className="admin-grid">{[['estoque','⬡','Estoque e pistões','Abastecimento e ajustes com histórico'],['relatorios','▥','Relatórios','Vendas, itens e sincronização simulada'],['configuracoes','⚙','Configurações','Simuladores, tempos e backups']].map(([slug, icon, title, description]) => <button className="admin-card" key={slug} onClick={() => navigate(`/admin/${slug}`)}><span className="card-icon">{icon}</span><h2>{title}</h2><p>{description}</p><span className="arrow">↗</span></button>)}</div><footer className="page-actions"><Button secondary onClick={() => navigate('/')}>← Tela de vendas</Button><span className="hint">Máquina {info.machineId.slice(0,8).toUpperCase()}</span><Button secondary onClick={logout}>Sair da administração</Button></footer></section>;
}

function Inventory({ navigate, notify }) {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [stock, setStock] = useState('');
  const [reason, setReason] = useState('Abastecimento');
  const [busy, setBusy] = useState(false);
  const [movements, setMovements] = useState(null);
  const [movementPage, setMovementPage] = useState(1);
  const [page, setPage] = useState(1);
  const ref = useRef();
  const capacity = useCapacity(ref, 92, 0, 4);
  useEffect(() => { api('products').then(setProducts).catch(notify); }, [notify]);
  async function save(event) {
    event.preventDefault(); if (busy) return; setBusy(true);
    try { const data = await api('adjustStock', { gateId: selected.gate_id, stock: Number(stock), reason }); setProducts(data); setSelected(null); notify('Estoque atualizado e movimentação registrada.'); }
    catch (error) { notify(error); } finally { setBusy(false); }
  }
  return <section className="flow-page"><Title eyebrow="ESTOQUE LOCAL" detail="Quatro pistões virtuais. Ajustes exigem um motivo e ficam no histórico.">Medalhas prontas para sair</Title><div ref={ref} className="inventory-list">{products.slice((Math.min(page, Math.ceil(products.length / capacity) || 1) - 1) * capacity, Math.min(page, Math.ceil(products.length / capacity) || 1) * capacity).map(p => <button className="inventory-row" key={p.id} onClick={() => { setSelected(p); setStock(String(p.stock)); setReason('Abastecimento'); }}><img src={images[p.image_key]} alt="" /><div><span className="eyebrow">PISTÃO {p.gate_id}</span><h2>{p.name}</h2></div><div className={`stock-indicator ${p.stock <= p.minimum_stock ? 'low' : ''}`}><strong>{p.stock}</strong><small>de {p.maximum_stock}</small></div><span className="inventory-detail">{p.reserved} reservadas · mínimo {p.minimum_stock}</span><span>Editar ↗</span></button>)}</div>{products.length > capacity && <Pager page={Math.min(page, Math.ceil(products.length / capacity))} pages={Math.ceil(products.length / capacity)} change={setPage} />}<footer className="page-actions"><Button secondary onClick={() => navigate('/admin')}>← Administração</Button><span className="hint">Baixa por unidade entregue.</span><Button secondary onClick={async () => { try { const result = await api('adminInfo'); setMovements(result.movements); setMovementPage(1); } catch (error) { notify(error); } }}>Últimas movimentações</Button></footer>{selected && <Modal title={`Ajustar ${selected.name}`} close={() => setSelected(null)}><form onSubmit={save} className="stock-form"><p>{selected.gate_id} · atual {selected.stock} · reservado {selected.reserved} · capacidade {selected.maximum_stock}</p><label>Novo estoque<input data-touch inputMode="numeric" value={stock} onChange={event => setStock(event.target.value.replace(/[^0-9]/g, ''))} required maxLength={3} /></label><div className="quick-adjust">{[0,20,50,100,360].map(value => <Button key={value} secondary onClick={() => setStock(String(value))}>{value === 0 ? 'Zerar' : value}</Button>)}</div><label>Motivo<input data-touch value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={200} required /></label><div className="actions"><Button secondary onClick={() => setSelected(null)}>Cancelar</Button><Button type="submit" disabled={busy || stock === '' || Number(stock) === selected.stock}>Gravar ajuste</Button></div></form></Modal>}{movements && <Modal title="Últimas 5 movimentações" close={() => setMovements(null)}><div className="sale-details">{!movements.length ? <p>Nenhuma movimentação registrada.</p> : movements.slice(movementPage - 1, movementPage).map(m => <article key={m.id}><span className="eyebrow">{m.gate_id} · {dateTime(m.created_at)}</span><h3>{m.name}</h3><p>{m.delta > 0 ? '+' : ''}{m.delta} unidades · saldo {m.balance}</p><p>{m.reason}</p></article>)}{movements.length > 0 && <Pager page={movementPage} pages={movements.length} change={setMovementPage} />}</div></Modal>}</section>;
}

function Modal({ title, children, close }) {
  useEffect(() => { const escape = event => { if (event.key === 'Escape') close(); }; document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape); }, [close]);
  return <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label={title} className="modal"><div className="modal-title"><h2>{title}</h2><Button secondary onClick={close} aria-label="Fechar janela">×</Button></div>{children}</section></div>;
}

function Reports({ navigate, notify }) {
  const [view, setView] = useState('sales');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('created_at');
  const [direction, setDirection] = useState('desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [details, setDetails] = useState(null);
  const [itemPage, setItemPage] = useState(1);
  const [group, setGroup] = useState(0);
  const [width, setWidth] = useState(window.innerWidth);
  const ref = useRef();
  const capacity = useCapacity(ref, 58, 62, 12);
  const reload = useCallback(async () => {
    const result = await api('report', { view, filters, sort, direction, page, pageSize: capacity });
    setData(result);
    if (page > Math.max(1, Math.ceil(result.total / capacity))) setPage(1);
  }, [view, filters, sort, direction, page, capacity]);
  useEffect(() => { let valid = true; reload().catch(error => { if (valid) notify(error); }); return () => { valid = false; }; }, [reload, notify]);
  useEffect(() => {
    if (data?.sync.last?.status !== 'pending') return;
    const timer = setInterval(() => { reload().catch(notify); }, 500);
    return () => clearInterval(timer);
  }, [data?.sync.last?.status, reload, notify]);
  useEffect(() => { const resize = () => setWidth(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const fields = [{ id:'created_at', label:'Data e hora' },{ id:'id', label:'Pedido' }, ...(view === 'items' ? [{ id:'name', label:'Produto' },{ id:'quantity', label:'Qtd.' },{ id:'unit_cents', label:'Unitário' },{ id:'subtotal_cents', label:'Subtotal' }] : []),{ id:'payment_type', label:'Pagamento' },{ id:'status', label:'Situação' },{ id:'total_cents', label:'Total da venda' }];
  const perGroup = width >= 1200 ? 9 : width >= 800 ? 5 : 3;
  const groups = Math.ceil(fields.length / perGroup);
  const visible = fields.slice(Math.min(group, groups - 1) * perGroup, (Math.min(group, groups - 1) + 1) * perGroup);
  const cell = (row, id) => id.endsWith('_cents') ? money(row[id]) : id === 'created_at' ? dateTime(row[id]) : id === 'payment_type' ? paymentNames[row[id]] : id === 'status' ? statusNames[row[id]] : id === 'id' ? row.id.slice(0,8).toUpperCase() : row[id];
  const order = id => { setSort(id); setDirection(sort === id && direction === 'asc' ? 'desc' : 'asc'); setPage(1); };
  const sync = data?.sync;
  async function synchronize() { try { await api('sync'); await reload(); } catch (error) { notify(error); } }
  return <section className="flow-page reports-page"><Title eyebrow="RELATÓRIOS LOCAIS" detail="Histórico de demonstração · filtros e ordenação por coluna.">Cada venda conta uma história</Title><div className="report-toolbar"><div className="segmented"><button className={view === 'sales' ? 'selected' : ''} onClick={() => { setView('sales'); setSort('created_at'); setFilters({}); setPage(1); setGroup(0); }}>Vendas</button><button className={view === 'items' ? 'selected' : ''} onClick={() => { setView('items'); setSort('created_at'); setFilters({}); setPage(1); setGroup(0); }}>Itens vendidos</button></div><span className="report-stats">{data?.stats.sales || 0} concluídas · {money(data?.stats.total_cents)}</span><Button secondary onClick={() => { setFilters({}); setPage(1); }}>Limpar filtros</Button></div><div className="sync-strip"><div><strong>{sync?.pending || 0} eventos pendentes de simulação</strong><small>{sync?.last?.status === 'pending' ? 'Simulando envio do lote…' : sync?.last?.status === 'failure' ? sync.last.error : sync?.last?.status === 'success' ? `${sync.last.count} eventos confirmados na simulação · ${dateTime(sync.last.finished_at)}` : 'Nenhum envio simulado ainda. Dados permanecem neste computador.'}</small></div><Button disabled={!sync?.pending || sync?.last?.status === 'pending'} onClick={synchronize}>{sync?.last?.status === 'pending' ? 'Sincronizando…' : 'Simular sincronização ↗'}</Button></div><div className="column-pager">{Object.keys(filters).length > 0 && <span>{Object.keys(filters).length} filtro(s) ativo(s)</span>}{groups > 1 && <Pager page={Math.min(group + 1, groups)} pages={groups} change={value => setGroup(value - 1)}>Colunas {Math.min(group + 1, groups)} / {groups}</Pager>}</div><div ref={ref} className="report-table-wrap"><table className="report-table"><thead><tr>{visible.map(field => <th key={field.id}><div><button className="sort-button" onClick={() => order(field.id)}>{field.label} {sort === field.id ? direction === 'asc' ? '↑' : '↓' : '↕'}</button><button className={`filter-button ${filters[field.id] ? 'active' : ''}`} aria-label={`Filtrar ${field.label}`} onClick={() => { setFilter(field); setFilterText(filters[field.id] || ''); }}>⌕</button></div></th>)}<th className="detail-column">Detalhes</th></tr></thead><tbody>{data?.rows.map((row, index) => <tr key={`${row.id}-${row.product_id || index}`}>{visible.map(field => <td key={field.id}>{cell(row, field.id)}</td>)}<td className="detail-column"><button className="table-detail" aria-label={`Ver pedido ${row.id.slice(0,8)}`} onClick={async () => { try { setDetails(await api('saleDetails', { id: row.id })); setItemPage(1); } catch (error) { notify(error); } }}>Ver ↗</button></td></tr>)}</tbody></table>{data && !data.rows.length && <div className="empty-state"><span>▥</span><h2>Nenhuma venda encontrada</h2><p>{Object.keys(filters).length ? 'Ajuste os filtros para ampliar a busca.' : 'As compras simuladas aparecerão aqui.'}</p></div>}</div><footer className="page-actions"><Button secondary onClick={() => navigate('/admin')}>← Administração</Button><span className="hint">{data?.total || 0} registros · {capacity} por página</span><Pager page={page} pages={Math.max(1, Math.ceil((data?.total || 0) / capacity))} change={setPage} /></footer>
    {filter && <Modal title={`Filtrar: ${filter.label}`} close={() => setFilter(null)}>
      <form onSubmit={event => {
        event.preventDefault();
        setFilters(value => {
          const next = { ...value };
          if (filterText.trim()) next[filter.id] = filterText;
          else delete next[filter.id];
          return next;
        });
        setPage(1);
        setFilter(null);
      }} className="filter-form">
        {filter.id === 'payment_type' || filter.id === 'status' ? (
          <label>{filter.label}
            <select value={filterText} onChange={event => setFilterText(event.target.value)}>
              <option value="">{filter.id === 'payment_type' ? 'Todas as formas de pagamento' : 'Todas as situações'}</option>
              {Object.entries(filter.id === 'payment_type' ? paymentNames : statusNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        ) : (
          <label>Contém<input data-touch value={filterText} maxLength={100} onChange={event => setFilterText(event.target.value)} placeholder={filter.id === 'created_at' ? 'Ex.: 19/10/2026 ou 2026-10-19' : filter.id.endsWith('_cents') ? 'Ex.: 5,50' : 'Digite um valor'} /></label>
        )}
        <div className="actions"><Button secondary onClick={() => setFilterText('')}>Limpar</Button><Button type="submit">Aplicar filtro</Button></div>
      </form>
    </Modal>}
    {details && <Modal title={`Pedido ${details.id.slice(0,8).toUpperCase()}`} close={() => setDetails(null)}><div className="sale-details"><p>{dateTime(details.created_at)} · {paymentNames[details.payment_type]} · {statusNames[details.status]}</p><div className="detail-item">{details.items.slice(itemPage - 1, itemPage).map(item => <article key={item.id}><img src={images[item.product_id]} alt="" /><div><h3>{item.name}</h3><p>{item.quantity} × {money(item.unit_cents)} = {money(item.quantity * item.unit_cents)}</p><small>{item.delivered} entregues · {item.gate_id}</small></div></article>)}</div><Pager page={itemPage} pages={details.items.length} change={setItemPage} /><div className="detail-summary"><strong>Total {money(details.total_cents)}</strong><span>{details.attempts.length} tentativa(s) de pagamento · demonstração</span></div></div></Modal>}
  </section>;
}

function Settings({ navigate, notify }) {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [tab, setTab] = useState('simulation');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('adminInfo').then(result => { setData(result); setSettings(result.settings); }).catch(notify); }, [notify]);
  async function save(event) {
    event.preventDefault(); setBusy(true);
    try { setSettings(await api('updateSettings', { ...settings, actuatorMs: Number(settings.actuatorMs), intervalMs: Number(settings.intervalMs) })); notify('Configurações salvas.'); } catch (error) { notify(error); } finally { setBusy(false); }
  }
  async function backup(method) { setBusy(true); try { const result = await api(method); if (result) notify(method === 'backup' ? `Backup salvo: ${result}` : 'Restaurando backup…'); } catch (error) { notify(error); } finally { setBusy(false); } }
  return <section className="flow-page"><Title eyebrow="CONFIGURAÇÕES" detail="Integrações simuladas. Nenhuma cobrança ou transmissão real.">Ajuste o ritmo da colmeia</Title><div className="segmented settings-tabs"><button className={tab === 'simulation' ? 'selected' : ''} onClick={() => setTab('simulation')}>Simuladores</button><button className={tab === 'data' ? 'selected' : ''} onClick={() => setTab('data')}>Dados e backups</button></div>{settings && tab === 'simulation' && <form className="settings-form" onSubmit={save}><label>Pagamento<select value={settings.paymentScenario} onChange={event => setSettings({ ...settings, paymentScenario: event.target.value })}><option value="random">Aleatório · 80% de sucesso</option><option value="success">Sempre aprovar (demonstração)</option><option value="failure">Sempre falhar (demonstração)</option></select></label><label>Sincronização<select value={settings.syncScenario} onChange={event => setSettings({ ...settings, syncScenario: event.target.value })}><option value="random">Aleatório · 80% de sucesso</option><option value="success">Sempre concluir (demonstração)</option><option value="failure">Sempre falhar (demonstração)</option></select></label><label>Acionamento por unidade (ms)<input data-touch inputMode="numeric" value={settings.actuatorMs} onChange={event => setSettings({ ...settings, actuatorMs: event.target.value.replace(/[^0-9]/g, '') })} maxLength={5} required /></label><label>Intervalo entre unidades (ms)<input data-touch inputMode="numeric" value={settings.intervalMs} onChange={event => setSettings({ ...settings, intervalMs: event.target.value.replace(/[^0-9]/g, '') })} maxLength={5} required /></label><p className="hint settings-note">Acionamento: 200–10.000 ms. Intervalo: 0–10.000 ms. A aprovação é exibida por 2 segundos antes da entrega.</p><Button type="submit" disabled={busy}>Salvar configurações</Button></form>}{tab === 'data' && <div className="data-panel"><div><h2>SQLite local</h2><p className="path-text">{data?.databasePath}</p><small>Máquina: {data?.machineId}</small></div><p>Backup automático a cada dia de abertura do aplicativo. São mantidas as últimas 14 cópias diárias. Exporte uma cópia para outro dispositivo para proteger seus dados contra falha do computador.</p><div className="actions"><Button disabled={busy || !window.medalHive} onClick={() => backup('backup')}>Exportar backup</Button><Button secondary disabled={busy || !window.medalHive} onClick={() => backup('restore')}>Restaurar backup</Button></div><small>A restauração aceita backups desta máquina sem operações em andamento e exige confirmação antes de substituir os dados. O MySQL anterior não foi alterado.</small></div>}<footer className="page-actions"><Button secondary onClick={() => navigate('/admin')}>← Administração</Button><span className="hint">Configurações persistidas somente nesta máquina.</span></footer></section>;
}
