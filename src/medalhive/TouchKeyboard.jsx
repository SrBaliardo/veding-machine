import { useEffect, useRef, useState } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';

export function TouchKeyboard({ target, close }) {
  const [layout, setLayout] = useState('default');
  const targetRef = useRef(target);
  const selection = useRef([0, 0]);
  const containerRef = useRef(null);
  const numeric = target?.inputMode === 'numeric' || target?.inputMode === 'decimal';
  targetRef.current = target;
  useEffect(() => {
    if (!containerRef.current) { document.documentElement.style.setProperty('--keyboard-height', '0px'); return; }
    const observer = new ResizeObserver(([entry]) => document.documentElement.style.setProperty('--keyboard-height', `${entry.borderBoxSize[0].blockSize + 10}px`));
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); document.documentElement.style.setProperty('--keyboard-height', '0px'); };
  }, [target, numeric]);
  useEffect(() => {
    setLayout('default');
    const update = () => {
      if (document.activeElement === target) selection.current = [target.selectionStart ?? target.value.length, target.selectionEnd ?? target.value.length];
    };
    update();
    document.addEventListener('selectionchange', update);
    target?.addEventListener('keyup', update);
    target?.addEventListener('click', update);
    return () => { document.removeEventListener('selectionchange', update); target?.removeEventListener('keyup', update); target?.removeEventListener('click', update); };
  }, [target]);
  if (!target) return null;
  const press = key => {
    const input = targetRef.current;
    if (!input?.isConnected) { close(); return; }
    if (key === '{shift}') { setLayout(value => value === 'shift' ? 'default' : 'shift'); return; }
    if (key === '{symbols}') { setLayout(value => value === 'symbols' ? 'default' : 'symbols'); return; }
    if (key === '{enter}') {
      const inputs = [...(input.form || document).querySelectorAll('input[data-touch],textarea[data-touch]')].filter(element => !element.disabled && element.offsetParent !== null);
      const next = inputs[inputs.indexOf(input) + 1];
      if (next) next.focus();
      else { input.form?.requestSubmit(); input.blur(); close(); }
      return;
    }
    const [start, end] = selection.current;
    const value = input.value;
    const left = key === '{bksp}' && start === end ? Math.max(0, start - 1) : start;
    const insert = key === '{bksp}' ? '' : key === '{space}' ? ' ' : key;
    const result = value.slice(0, left) + insert + value.slice(end);
    if (input.maxLength > 0 && result.length > input.maxLength) return;
    Object.getOwnPropertyDescriptor(input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, result);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const caret = left + insert.length;
    input.focus({ preventScroll: true });
    input.setSelectionRange(caret, caret);
    selection.current = [caret, caret];
    if (layout === 'shift' && !key.startsWith('{')) setLayout('default');
  };
  return (
    <section ref={containerRef} className={`touch-keyboard ${numeric ? 'numeric' : ''}`} aria-label="Teclado virtual" onPointerDown={event => event.preventDefault()}>
      <div className="keyboard-heading"><span>{target.type === 'password' ? 'Senha protegida' : target.getAttribute('aria-label') || target.placeholder || 'Digite no campo selecionado'}</span><button type="button" className="text-button" onClick={() => { target.blur(); close(); }}>Fechar teclado ↓</button></div>
      <Keyboard layoutName={numeric ? 'numeric' : layout} onKeyPress={press} preventMouseDownDefault disableCaretPositioning
        layout={{
          default: ['1 2 3 4 5 6 7 8 9 0', 'q w e r t y u i o p', 'a s d f g h j k l ç', '{shift} z x c v b n m {bksp}', '{symbols} @ . - _ {space} {enter}'],
          shift: ['1 2 3 4 5 6 7 8 9 0', 'Q W E R T Y U I O P', 'A S D F G H J K L Ç', '{shift} Z X C V B N M {bksp}', '{symbols} @ . - _ {space} {enter}'],
          symbols: ['! @ # $ % & * ( ) ?', 'á é í ó ú ã õ â ê ô', 'Á É Í Ó Ú Ã Õ Â Ê Ô', '+ = / ; : , " \' {bksp}', '{symbols} {space} {enter}'],
          numeric: ['1 2 3 4 5', '6 7 8 9 0', '{bksp} . - {enter}'],
        }}
        display={{ '{bksp}': '⌫', '{shift}': '⇧', '{symbols}': layout === 'symbols' ? 'ABC' : '?123', '{space}': 'Espaço', '{enter}': 'OK →' }} />
    </section>
  );
}
