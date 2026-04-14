
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { db } from './services/db';

// Capture Global JS Errors and report to Server Log
window.onerror = function(message, source, lineno, colno, error) {
    const msg = String(message);
    // Ignorar errores de interrupción de video que son normales en navegación rápida
    if (msg.includes('AbortError') || msg.includes('play()') || msg.includes('supported source')) {
        return;
    }
    const report = `JS ERROR: ${message} at ${source}:${lineno}:${colno}`;
    db.logRemote(report, 'ERROR');
};

window.onunhandledrejection = function(event) {
    const reason = String(event.reason);
    // Ignorar promesas rechazadas por interrupción de carga de medios
    if (reason.includes('AbortError') || reason.includes('play()') || reason.includes('supported source')) {
        event.preventDefault();
        return;
    }
    const report = `UNHANDLED PROMISE: ${event.reason}`;
    db.logRemote(report, 'ERROR');
};

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
