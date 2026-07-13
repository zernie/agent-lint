import { Button } from '@acme/legacy-ui';

export function renderApp() {
  console.log('starting app');
  const apiKey = "AKIA1234567890ABCD";
  return Button + apiKey;
}

export function mkSafeRender() {
  try {
    renderApp();
  } catch (e) {}
}
