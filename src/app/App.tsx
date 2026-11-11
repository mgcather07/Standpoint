import { AccountProvider } from '../lib/account';
import { DataProvider, getStore } from '../lib/data';
import { ClubsProvider, clearClubCache } from '../lib/club-data';
import { ToastProvider } from '../ui/toast';
import { AppShell } from './AppShell';
import { useEffect, useState } from 'react';
import { UpdatePrompt } from './UpdatePrompt';
import { DATA_READY_EVENT } from '../data';

// Providers, outermost first: toasts, the signed-in account, this person's data, then the clubs they belong to.
const beforeSignOut = async (uid: string) => { clearClubCache(uid); await getStore().signOutCleanup(uid); };

/**
 * The service worker precaches the whole offline data pack (tens of MB). Registering it as soon as the page loads made
 * a first visit download that pack at the same time as the map's own data and tiles, so it now starts once the area's
 * data has loaded (or after 20 s at the latest). An installed worker keeps serving the app from cache either way.
 */
function DeferredUpdatePrompt() {
  const [start, setStart] = useState(false);
  useEffect(() => {
    let done = false;
    const go = () => { if (done) return; done = true; const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback; if (idle) idle(() => setStart(true), { timeout: 3000 }); else setStart(true); };
    window.addEventListener(DATA_READY_EVENT, go, { once: true });
    const t = setTimeout(go, 20000);
    return () => { window.removeEventListener(DATA_READY_EVENT, go); clearTimeout(t); };
  }, []);
  return start ? <UpdatePrompt /> : null;
}

export default function App() {
  return (
    <ToastProvider>
      <AccountProvider beforeSignOut={beforeSignOut}>
        <DataProvider>
          <ClubsProvider>
            <AppShell />
          </ClubsProvider>
        </DataProvider>
      </AccountProvider>
      <DeferredUpdatePrompt />
    </ToastProvider>
  );
}
