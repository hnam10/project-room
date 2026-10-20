import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { FeedbackProvider } from './components/Feedback';
import { SessionProvider } from './state/session';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <FeedbackProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </FeedbackProvider>
    </BrowserRouter>
  </StrictMode>,
);
