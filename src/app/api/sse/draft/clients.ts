type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
};

const clients: SSEClient[] = [];

export function addClient(id: string, controller: ReadableStreamDefaultController) {
  clients.push({ id, controller });
}

export function removeClient(id: string) {
  const index = clients.findIndex(c => c.id === id);
  if (index !== -1) clients.splice(index, 1);
}

export function broadcastEvent(event: string, data: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(message);

  for (const client of clients) {
    try {
      client.controller.enqueue(encoded);
    } catch {
      // Client disconnected
      removeClient(client.id);
    }
  }
}

export function getClientCount() {
  return clients.length;
}
