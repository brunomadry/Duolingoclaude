import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app/App.tsx';

const root = document.getElementById('app');
if (root) render(<App />, root);
