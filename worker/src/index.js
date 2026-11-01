export { Temple } from './temple.js';

// Một chánh điện duy nhất cho mọi người xem: tất cả WebSocket vào cùng Durable Object "main"
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }
      return env.TEMPLE.getByName('main').fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
