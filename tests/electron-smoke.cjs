const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runSmoke(window, store) {
  const errors = [];
  window.webContents.on('console-message', event => { if (event.level === 'error') { errors.push(event.message); console.error('RENDERER:', event.message); } });
  const evaluate = async code => { try { return await window.webContents.executeJavaScript(code, true); } catch (error) { throw new Error(`Renderer expression failed: ${code}\n${error.message}`); } };
  async function until(code, timeout = 12000) {
    const limit = Date.now() + timeout;
    while (Date.now() < limit) { if (await evaluate(`Boolean(${code})`)) return; await delay(100); }
    throw new Error(`Timeout: ${code}\n${await evaluate('document.body.innerText')}`);
  }
  const click = text => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button) throw new Error('Botão ausente: '+${JSON.stringify(text)}); button.click(); })()`);
  const fill = (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Campo ausente'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const go = async hash => { await evaluate(`location.hash=${JSON.stringify(hash)}`); await delay(350); };
  const screenshots = path.resolve('.tmp/screenshots'); fs.mkdirSync(screenshots, { recursive: true });
  async function shot(name) { await delay(100); fs.writeFileSync(path.join(screenshots, `${name.replace(/[^a-zA-Z0-9_-]/g,'-')}.png`), (await window.webContents.capturePage()).toPNG()); }
  async function fit(name) {
    await delay(120);
    const state = await evaluate(`(() => { const elements=[document.documentElement,document.body,document.querySelector('.page'),document.querySelector('.flow-page'),document.querySelector('.login-page'),document.querySelector('.modal')].filter(Boolean); return { viewport:[innerWidth,innerHeight], overflow:elements.filter(e=>e.scrollHeight>e.clientHeight+3).map(e=>({element:e.className||e.tagName,height:e.clientHeight,content:e.scrollHeight})), broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src), modal:document.querySelector('.modal')?.getBoundingClientRect().toJSON() }; })()`);
    if (state.overflow.length || state.broken.length) { await shot(`FAILED-${name}`); throw new Error(`${name}: ${JSON.stringify(state)}`); }
    console.log(`UI OK ${name} ${state.viewport.join('x')}`);
  }
  await until("document.querySelector('.home-page') && document.body.innerText.includes('Primeiro uso')");
  await shot('01-inicio');
  await click('Administrador'); await until("document.querySelector('.login-form')");
  await fill('input[autocomplete="new-password"]','demo123');
  await fill('.login-form label:last-of-type input','demo123');
  await evaluate("document.querySelector('.login-form input').focus();document.querySelector('.login-form input').dispatchEvent(new FocusEvent('focusin',{bubbles:true}))");
  await until("document.querySelector('.touch-keyboard')"); await delay(200);
  await evaluate("document.querySelector('.login-form input').setSelectionRange(2,4);document.dispatchEvent(new Event('selectionchange'))");
  await evaluate("(() => { const key=document.querySelector('.hg-button[data-skbtn=\"x\"]');key.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,buttons:1,pointerId:1,pointerType:'touch',isPrimary:true}));key.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,pointerId:1,pointerType:'touch',isPrimary:true})); })()");
  await until("document.querySelector('.login-form input').value==='adxn'");
  await fill('.login-form input','admin');
  window.setContentSize(640,480); await delay(350);
  await fit('login-teclado-pequeno'); await shot('02-login-teclado');
  await click('Fechar teclado ↓'); await delay(150);
  await click('Criar acesso'); await until("document.querySelector('.admin-grid')"); console.log('UI ADMIN SETUP OK');
  await go('/admin/estoque'); await until("document.querySelectorAll('.inventory-row').length>0");
  await evaluate("document.querySelector('.inventory-row').click()"); await delay(150);
  await fill('.stock-form input[inputmode="numeric"]','20');
  await evaluate("document.querySelector('.stock-form input[inputmode=\"numeric\"]').focus();document.querySelector('.stock-form input[inputmode=\"numeric\"]').dispatchEvent(new FocusEvent('focusin',{bubbles:true}))");
  await until("document.querySelector('.touch-keyboard')"); await delay(150);
  await fit('estoque-teclado-pequeno');
  await click('Fechar teclado ↓'); await click('Gravar ajuste'); await until("!document.querySelector('.modal')");
  assert.equal(store.products()[0].stock,20);
  store.products().slice(1).forEach(p => store.adjustStock({ gateId:p.gate_id,stock:20,reason:'Carga de demonstração UI' }));
  store.updateSettings({ paymentScenario:'success',syncScenario:'success',actuatorMs:200,intervalMs:0 });
  for (const [width,height] of [[640,480],[800,600],[1024,768],[768,1024],[1080,1920],[1366,768]]) {
    window.setContentSize(width,height); await delay(100);
    for (const route of ['/','/vendas','/admin','/admin/estoque','/admin/relatorios','/admin/configuracoes']) { await go(route); await fit(`${route}-${width}x${height}`); }
  }
  window.setContentSize(1024,768);
  await go('/vendas'); await until("document.querySelector('.product-card')");
  await evaluate("document.querySelectorAll('.product-card .quantity button:last-child').forEach(b=>b.click())");
  await click('Conferir pedido →'); await until("document.querySelector('.summary-row')"); await shot('03-conferencia');
  await click('Ir para pagamento →'); await until("document.querySelector('.payment-card')"); await fit('pagamento');
  await evaluate("document.querySelector('.payment-card').click()"); await until("document.querySelector('.qr-block')"); await shot('04-pix-simulado');
  const saleId = store.activeSale().id;
  await until("document.body.innerText.includes('Pagamento confirmado!')",10000); await shot('05-confirmacao');
  await until("document.body.innerText.includes('Tudo pronto. Obrigado!')",12000); await shot('06-entrega');
  assert.equal(store.sale(saleId).status,'completed');
  assert.equal(store.sale(saleId).delivered,2);
  await until("document.querySelector('.home-page')",8000);
  await go('/admin/relatorios'); await until("document.querySelectorAll('tbody tr').length>0"); await fit('relatorio-com-venda'); await shot('07-relatorios');
  const selectFilter = async (label, value, expectedLabel) => {
    await evaluate(`document.querySelector('[aria-label="Filtrar ${label}"]').click()`);
    await until("document.querySelector('.filter-form select')");
    await evaluate(`(() => { const el=document.querySelector('.filter-form select');el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    assert.equal(await evaluate("document.querySelector('.filter-form select').selectedOptions[0].textContent"),expectedLabel);
    await click('Aplicar filtro');
  };
  await selectFilter('Pagamento','CREDIT','Crédito');
  await until("document.body.innerText.includes('Nenhuma venda encontrada')");
  await evaluate("document.querySelector('[aria-label=\"Filtrar Pagamento\"]').click()");
  await until("document.querySelector('.filter-form select')");
  assert.equal(await evaluate("document.querySelector('.filter-form select').selectedOptions[0].textContent"),'Crédito');
  await click('Limpar'); await click('Aplicar filtro');
  await until("document.querySelectorAll('tbody tr').length>0");
  await selectFilter('Pagamento','DEBIT','Débito');
  await until("document.body.innerText.includes('Nenhuma venda encontrada')");
  await click('Limpar filtros'); await until("document.querySelectorAll('tbody tr').length>0");
  await selectFilter('Situação','completed','Concluída');
  await until("document.querySelectorAll('tbody tr').length>0");
  await evaluate("document.querySelector('[aria-label=\"Filtrar Situação\"]').click()");
  await until("document.querySelector('.filter-form select')");
  assert.equal(await evaluate("document.querySelector('.filter-form select').selectedOptions[0].textContent"),'Concluída');
  window.setContentSize(640,480); await fit('filtro-ptbr-pequeno'); await shot('08-filtro-ptbr');
  await click('Aplicar filtro'); window.setContentSize(1024,768);
  await click('Limpar filtros');
  await click('Itens vendidos'); await until("document.body.innerText.includes('Produto')");
  await evaluate("document.querySelector('.filter-button').click()"); await until("document.querySelector('.filter-form')");
  await fill('.filter-form input','2099'); await click('Aplicar filtro'); await until("document.body.innerText.includes('Nenhuma venda encontrada')");
  await click('Limpar filtros'); await until("document.querySelectorAll('tbody tr').length>0");
  await click('Simular sincronização ↗'); await until("document.body.innerText.includes('confirmados na simulação')");
  assert.equal(store.syncStatus().pending,0);
  await go('/admin/configuracoes'); await click('Dados e backups'); await fit('dados-e-backups');
  assert.equal(await evaluate("document.querySelector('.path-text').textContent"),store.filename);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('MEDALHIVE_UI_PASS · compra PIX, dispensa, estoque, filtros, sincronização, imagens e seis resoluções');
}
module.exports = { runSmoke };
