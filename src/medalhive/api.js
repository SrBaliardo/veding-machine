let token;
export function setToken(value) { token = value; }
export async function api(method, payload = {}) {
  const result = window.medalHive
    ? await window.medalHive.invoke(method, payload, token)
    : await fetch('/__medalhive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method, payload, token }) }).then(response => {
      if (!response.ok) throw new Error('Abra o MedalHive pelo aplicativo ou pelo comando de desenvolvimento.');
      return response.json();
    });
  if (!result.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
  return result.data;
}
