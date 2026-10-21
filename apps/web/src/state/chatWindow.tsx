import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFeedback } from '../components/Feedback';
import { readStored, writeStored } from './storage';

// Where the chat panel lives:
//   docked   – in the dock under the board
//   floating – a draggable window inside the page
//   pip      – a separate always-on-top OS window (Document Picture-in-Picture; Chrome/Edge)
//   popup    – a separate browser window (fallback where PiP isn't supported)

export type ChatMode = 'docked' | 'floating' | 'pip' | 'popup';

export interface DockLayout {
  mode: ChatMode;
  float: { x: number | null; y: number | null; w: number; h: number };
  /** Chat share of the dock width, in percent. null = default. */
  chatWidth: number | null;
  /** Dock height in px. null = default. */
  dockHeight: number | null;
  brainstormClosed: boolean;
}

const LAYOUT_KEY = 'project-room-layout-v2';
const FLOAT_MIN = { w: 340, h: 280 };
export const POPUP_CHANNEL = 'project-room-chat-window';

const DEFAULT_LAYOUT: DockLayout = {
  mode: 'docked',
  float: { x: null, y: null, w: 460, h: 540 },
  chatWidth: null,
  dockHeight: null,
  brainstormClosed: false,
};

function loadLayout(): DockLayout {
  const stored = readStored<Partial<DockLayout>>(LAYOUT_KEY, {});
  const layout = { ...DEFAULT_LAYOUT, ...stored, float: { ...DEFAULT_LAYOUT.float, ...stored.float } };
  // Separate windows don't survive a reload.
  if (layout.mode === 'pip' || layout.mode === 'popup') layout.mode = 'docked';
  return layout;
}

export function clampFloat(f: DockLayout['float']): Required<{ [K in keyof DockLayout['float']]: number }> {
  const w = Math.max(FLOAT_MIN.w, Math.min(f.w, innerWidth - 16));
  const h = Math.max(FLOAT_MIN.h, Math.min(f.h, innerHeight - 16));
  const x = Math.max(8, Math.min(f.x ?? innerWidth - w - 24, innerWidth - w - 8));
  const y = Math.max(8, Math.min(f.y ?? innerHeight - h - 24, innerHeight - 48));
  return { x, y, w, h };
}

interface ChatWindow {
  layout: DockLayout;
  update: (changes: Partial<DockLayout>) => void;
  pipWindow: Window | null;
  dropTarget: boolean;
  /** The dock registers itself so drags can tell when they're over it. */
  dockRef: React.RefObject<HTMLElement | null>;
  beginHeaderDrag: (event: React.PointerEvent, panel: HTMLElement) => void;
  floatInPage: () => void;
  openSeparateWindow: () => Promise<void>;
  dock: () => void;
}

const ChatWindowContext = createContext<ChatWindow | null>(null);

export function ChatWindowProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { toast } = useFeedback();
  const [layout, setLayout] = useState(loadLayout);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [dropTarget, setDropTarget] = useState(false);
  const dockRef = useRef<HTMLElement | null>(null);
  const popupRef = useRef<Window | null>(null);
  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const update = useCallback((changes: Partial<DockLayout>) => {
    setLayout((current) => {
      const next = { ...current, ...changes };
      writeStored(LAYOUT_KEY, next);
      return next;
    });
  }, []);

  /** Switches mode, then closes any separate window (its close handler sees the new mode). */
  const switchTo = useCallback(
    (changes: Partial<DockLayout> & { mode: ChatMode }) => {
      layoutRef.current = { ...layoutRef.current, ...changes };
      update(changes);
      pipWindow?.close();
      popupRef.current?.close();
      popupRef.current = null;
    },
    [pipWindow, update],
  );

  const dock = useCallback(() => switchTo({ mode: 'docked' }), [switchTo]);
  const floatInPage = useCallback(() => switchTo({ mode: 'floating', float: clampFloat(layoutRef.current.float) }), [switchTo]);

  const openSeparateWindow = useCallback(async () => {
    const pip = (window as Window & { documentPictureInPicture?: { requestWindow(o: object): Promise<Window> } }).documentPictureInPicture;
    if (pip) {
      try {
        const win = await pip.requestWindow({ width: 420, height: 640 });
        for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
          win.document.head.appendChild(node.cloneNode(true));
        }
        win.document.documentElement.classList.add('chat-window');
        win.document.title = 'Project Room chat';
        win.addEventListener('pagehide', () => {
          setPipWindow(null);
          if (layoutRef.current.mode === 'pip') update({ mode: 'docked' });
        });
        setPipWindow(win);
        update({ mode: 'pip' });
        return;
      } catch {
        // Fall through to a regular popup window.
      }
    }
    const win = window.open(`/p/${projectId}/popout/chat`, 'project-room-chat', 'popup,width=440,height=660');
    if (!win) {
      toast('Your browser blocked the chat window. Allow pop-ups for this site and try again.');
      return;
    }
    popupRef.current = win;
    update({ mode: 'popup' });
  }, [projectId, toast, update]);

  // Popup fallback: notice when it closes, or when it asks to dock back.
  useEffect(() => {
    if (layout.mode !== 'popup') return;
    const timer = window.setInterval(() => {
      if (!popupRef.current || popupRef.current.closed) update({ mode: 'docked' });
    }, 800);
    const channel = new BroadcastChannel(POPUP_CHANNEL);
    channel.onmessage = (e) => e.data === 'dock' && dock();
    return () => {
      window.clearInterval(timer);
      channel.close();
    };
  }, [layout.mode, update, dock]);

  useEffect(() => {
    const onResize = () => layoutRef.current.mode === 'floating' && update({ float: clampFloat(layoutRef.current.float) });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [update]);

  // Drag the chat header out of the dock to float it; drop a floating chat on the dock to re-attach.
  const beginHeaderDrag = useCallback(
    (event: React.PointerEvent, panel: HTMLElement) => {
      const from = layoutRef.current.mode;
      if (event.button !== 0 || (event.target as HTMLElement).closest('.window-actions')) return;
      if (from !== 'docked' && from !== 'floating') return;
      if (from === 'docked' && matchMedia('(max-width: 1100px)').matches) return;

      const start = { x: event.clientX, y: event.clientY };
      let grab: { dx: number; dy: number } | null = null;
      let moved = false;
      const overDock = (x: number, y: number) => {
        const el = dockRef.current;
        if (!el || !el.offsetParent) return false;
        const r = el.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      };

      const move = (e: PointerEvent) => {
        if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
        if (!moved) {
          moved = true;
          document.body.classList.add('moving-panel');
        }
        let mode = layoutRef.current.mode;
        if (mode === 'docked') {
          if (overDock(e.clientX, e.clientY)) return;
          const { w } = clampFloat(layoutRef.current.float);
          grab = { dx: Math.min(Math.max(start.x - panel.getBoundingClientRect().left, 40), w - 40), dy: 20 };
          mode = 'floating';
        }
        if (!grab) {
          const r = panel.getBoundingClientRect();
          grab = { dx: start.x - r.left, dy: start.y - r.top };
        }
        const float = clampFloat({ ...layoutRef.current.float, x: e.clientX - grab.dx, y: e.clientY - grab.dy });
        layoutRef.current = { ...layoutRef.current, mode, float };
        setLayout(layoutRef.current);
        setDropTarget(overDock(e.clientX, e.clientY));
      };

      const stop = (e: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
        document.body.classList.remove('moving-panel');
        setDropTarget(false);
        if (!moved) return;
        // Swallow the click that ends a drag so it doesn't switch tabs. A click only follows when
        // the pointer went down and up on the same element, so don't leave the listener behind.
        const swallow = (c: MouseEvent) => c.stopPropagation();
        window.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
        const docked = layoutRef.current.mode === 'floating' && e.type === 'pointerup' && overDock(e.clientX, e.clientY);
        update(docked ? { mode: 'docked' } : {});
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    },
    [update],
  );

  const value = useMemo<ChatWindow>(
    () => ({ layout, update, pipWindow, dropTarget, dockRef, beginHeaderDrag, floatInPage, openSeparateWindow, dock }),
    [layout, update, pipWindow, dropTarget, beginHeaderDrag, floatInPage, openSeparateWindow, dock],
  );

  return <ChatWindowContext.Provider value={value}>{children}</ChatWindowContext.Provider>;
}

export function useChatWindow(): ChatWindow {
  const ctx = useContext(ChatWindowContext);
  if (!ctx) throw new Error('useChatWindow must be used inside <ChatWindowProvider>');
  return ctx;
}
