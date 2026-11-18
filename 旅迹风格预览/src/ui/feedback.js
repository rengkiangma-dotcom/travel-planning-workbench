import { reactive } from 'vue';

export const ui = reactive({ toast: '', confirm: null });

let timer = null;

export function toast(text) {
  ui.toast = String(text || '');
  clearTimeout(timer);
  timer = setTimeout(() => { ui.toast = ''; }, 3200);
}

export function confirmDo(title, text) {
  return new Promise((resolve) => {
    ui.confirm = { title, text, resolve };
  });
}

export function resolveConfirm(answer) {
  const current = ui.confirm;
  ui.confirm = null;
  current?.resolve(Boolean(answer));
}
