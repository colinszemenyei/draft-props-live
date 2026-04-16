import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { addClient, removeClient } from './clients';
import { v4 as uuid } from 'uuid';
import { initializeDatabase } from '@/lib/db/init';
import { ensurePollingIfLive } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  await initializeDatabase();
  const session = await getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Auto-resume polling if draft is live (handles server restarts)
  const year = parseInt(process.env.DRAFT_YEAR || '2026');
  ensurePollingIfLive(year);

  const clientId = uuid();

  const stream = new ReadableStream({
    start(controller) {
      addClient(clientId, controller);

      // Send initial connection message
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`));

      // Heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
          removeClient(clientId);
        }
      }, 30000);

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        removeClient(clientId);
      });
    },
    cancel() {
      removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
