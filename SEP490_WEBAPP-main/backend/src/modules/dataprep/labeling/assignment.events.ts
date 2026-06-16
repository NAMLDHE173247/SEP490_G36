import { Request, Response } from 'express';

// Keeps track of all connected SSE clients
let clients: Array<{ id: string; res: Response }> = [];

/**
 * Handle new SSE connections
 */
export const sseHandler = (req: Request, res: Response) => {
  // Set headers for Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Assign a unique ID to this client
  const clientId = Date.now().toString();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  // Send an initial connected message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established' })}\n\n`);

  // Handle client disconnect
  req.on('close', () => {
    clients = clients.filter(client => client.id !== clientId);
  });
};

/**
 * Broadcast an event to all connected clients
 */
export const broadcastAssignmentUpdate = (eventPayload: any) => {
  const dataString = `data: ${JSON.stringify(eventPayload)}\n\n`;
  clients.forEach(client => {
    client.res.write(dataString);
  });
};
