import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { clerkPublishableKey } from './api/auth';
import { ClerkRoot } from './features/account/ClerkAccount';
import { FeedbackProvider } from './components/Feedback';
import { SessionProvider } from './state/session';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <FeedbackProvider>
        {clerkPublishableKey ? (
          <ClerkRoot>
            <SessionProvider>
              <App />
            </SessionProvider>
          </ClerkRoot>
        ) : (
          <div className="boot">
            <div>
              <h1>Sign-in isn’t configured</h1>
              <p>
                Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in <code>apps/web/.env.local</code> and restart. Project Room has no anonymous
                mode.
              </p>
            </div>
          </div>
        )}
      </FeedbackProvider>
    </BrowserRouter>
  </StrictMode>,
);
