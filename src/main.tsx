import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { App } from './app/App.tsx';
import { setupPwa } from './app/pwa.ts';
import { boot } from './state/app.ts';

const root = document.getElementById('app');
if (root) render(<App />, root);
void boot();
setupPwa();
