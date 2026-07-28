import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';

// WebGL compatibility patch for PIXI in headless/iframe environments
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, options) {
  const gl = originalGetContext.call(this, type, options);
  if (gl && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
    const origGetParameter = gl.getParameter.bind(gl);
    gl.getParameter = function(pname) {
      if (pname === gl.MAX_FRAGMENT_UNIFORM_VECTORS) {
        const res = origGetParameter(pname);
        if (!res || res <= 0) return 16; // Sane default to avoid checkMaxIfStatementsInShader crash
        return res;
      }
      return origGetParameter(pname);
    };
  }
  return gl;
};

import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
