import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { clerkEnabled } from './api/auth';
import { ClerkRoot } from './features/account/ClerkAccount';
import { FeedbackProvider } from './components/Feedback';
import { SessionProvider } from './state/session';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <FeedbackProvider>
        {clerkEnabled ? (
          <ClerkRoot>
            <SessionProvider>
              <App />
            </SessionProvider>
          </ClerkRoot>
        ) : (
          <SessionProvider>
            <App />
          </SessionProvider>
        )}
      </FeedbackProvider>
    </BrowserRouter>
  </StrictMode>,
);
