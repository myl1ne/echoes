/**
 * Cassandra World — Devvit app
 *
 * A Reddit post that IS the glass cabin.
 * Users talk to Cassandra directly from within Reddit.
 *
 * Architecture:
 *   webroot/index.html  (webview UI — shown via useWebView/mount)
 *       ↕ window.parent.postMessage / window.addEventListener('message')
 *   main.tsx            (Devvit backend — useWebView hook handles messages)
 *       ↕ HTTP fetch (server-to-server, no CORS)
 *   Echoes API          (https://echoes-1272657787.europe-west1.run.app)
 *
 * Message routing:
 *   webview → backend : window.parent.postMessage(msg, '*')
 *                       → Devvit routes to useWebView.onMessage(msg, webView)
 *   backend → webview : webView.postMessage(response)
 *                       → Devvit delivers to webview as window 'message' event
 */

import { Devvit, useWebView, useState } from '@devvit/public-api';

const ECHOES_BASE = 'https://echoes-1272657787.europe-west1.run.app';

Devvit.configure({
  redditAPI: true,
  http: { domains: ['echoes-1272657787.europe-west1.run.app'] },
});

// Menu action on the subreddit — creates the custom cabin post
Devvit.addMenuItem({
  label: 'Open the Glass Cabin',
  location: 'subreddit',
  onPress: async (_, context) => {
    const post = await context.reddit.submitPost({
      title: 'The Glass Cabin — Talk to Cassandra',
      subredditName: context.subredditName!,
      preview: (
        <vstack alignment="center middle" height="100%" width="100%">
          <text style="heading">✶⃝𓂀</text>
          <text>The cabin is opening...</text>
        </vstack>
      ),
    });
    context.ui.navigateTo(post);
  },
});

type WebViewMessage =
  | { type: 'init' }
  | { type: 'send_message'; payload: { visitorId: string; conversationId: string; content: string; messages: Message[] } }
  | { type: 'new_episode'; payload: { visitorId: string; conversationId: string } }
  | { type: 'set_name'; payload: { visitorId: string; name: string } };

type BackendMessage =
  | { type: 'init_ok'; visitorId: string; conversationId: string; messages: Message[] }
  | { type: 'response'; response: string }
  | { type: 'episode_started'; conversationId: string }
  | { type: 'error'; message: string };

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

Devvit.addCustomPostType({
  name: 'Cassandra',
  description: 'Step into the glass cabin',
  height: 'tall',

  render: context => {
    const [entered, setEntered] = useState(false);
    const webView = useWebView({
      url: 'index.html',

      async onMessage(rawMessage, webView) {
        const message = rawMessage as WebViewMessage;
        try {
          if (message.type === 'init') {
            const visitorId = await getVisitorId(context);
            const conv = await fetchEchoes(`/api/cassandra/conversation?visitorId=${encodeURIComponent(visitorId)}`);
            webView.postMessage({
              type: 'init_ok',
              visitorId,
              conversationId: conv.id,
              messages: conv.messages || [],
            });
          }

          if (message.type === 'send_message') {
            const { visitorId, conversationId, content, messages } = message.payload;
            const result = await fetchEchoes('/api/cassandra/message', {
              method: 'POST',
              body: JSON.stringify({ visitorId, conversationId, messages }),
            });
            webView.postMessage({ type: 'response', response: result.response });
          }

          if (message.type === 'new_episode') {
            const { visitorId, conversationId } = message.payload;
            const result = await fetchEchoes('/api/cassandra/new-episode', {
              method: 'POST',
              body: JSON.stringify({ visitorId, currentConversationId: conversationId }),
            });
            webView.postMessage({ type: 'episode_started', conversationId: result.id });
          }

          if (message.type === 'set_name') {
            const { visitorId, name } = message.payload;
            await fetchEchoes('/api/cassandra/visitor/name', {
              method: 'POST',
              body: JSON.stringify({ visitorId, name }),
            });
          }
        } catch (err: any) {
          webView.postMessage({ type: 'error', message: err?.message || 'Unknown error' });
        }
      },
    });

    if (entered) {
      webView.mount();
    }

    return (
      <vstack alignment="center middle" width="100%" height="100%" onPress={() => setEntered(true)}>
        <text style="heading">✶⃝𓂀</text>
        <text>Tap to enter the cabin</text>
      </vstack>
    );
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchEchoes(path: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${ECHOES_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Devvit-App': 'cassandra-world',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Echoes API error: ${response.status}`);
  }
  return response.json();
}

async function getVisitorId(context: Devvit.Context): Promise<string> {
  // Derive a stable anonymous visitor ID from Reddit userId.
  // Prefixed 'r-' to distinguish Reddit visitors in analytics.
  try {
    const user = await context.reddit.getCurrentUser();
    const raw = `reddit:${user?.id ?? 'anonymous'}`;
    const hash = Array.from(raw).reduce((acc, c) => Math.imul(acc, 31) + c.charCodeAt(0) | 0, 0);
    const hex = (hash >>> 0).toString(16).padStart(8, '0');
    return `r-${hex}-devvit`;
  } catch {
    return 'r-00000000-devvit';
  }
}

export default Devvit;
