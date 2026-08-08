import FormData from 'form-data';
import { configService } from '../services/configService';

/**
 * Headers required to reach the GPU service through ngrok/LocalTunnel dev
 * tunnels without hitting their interstitial warning pages. Previously this
 * literal was duplicated across every GPU call site.
 */
export const GPU_TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
  'Bypass-Tunnel-Reminder': 'true',
};

function resolveUrlString(url: unknown): string {
  if (typeof url === 'string') return url;
  if (url && typeof url === 'object') {
    const anyUrl = url as any;
    if (typeof anyUrl.href === 'string') return anyUrl.href;
    if (typeof anyUrl.url === 'string') return anyUrl.url;
    if (typeof anyUrl.toString === 'function') return anyUrl.toString();
  }
  return '';
}

/**
 * Attach the shared GPU service token, but ONLY when the request targets a
 * known GPU origin — never for third-party APIs (OpenRouter, HuggingFace, …),
 * so the secret cannot leak. Existing headers are preserved.
 */
function withGpuToken(url: unknown, init?: any): any {
  const token = process.env.GPU_SERVICE_TOKEN || '';
  if (!token) return init;
  if (!configService.isGpuTarget(resolveUrlString(url))) return init;
  return {
    ...(init || {}),
    headers: { ...(init?.headers || {}), 'X-GPU-Token': token },
  };
}

/**
 * Shared node-fetch wrapper. Replaces the identical `const fetch = async …`
 * definitions that were copy-pasted into every controller, and transparently
 * authenticates outbound GPU-service calls.
 */
export async function nodeFetch(url: any, init?: any) {
  const mod = await import('node-fetch');
  return mod.default(url, withGpuToken(url, init));
}

/** Response type produced by {@link nodeFetch} (node-fetch's Response). */
export type GpuResponse = Awaited<ReturnType<typeof nodeFetch>>;

/**
 * POST a multipart/form-data body with an explicit Content-Length.
 *
 * node-fetch + form-data streams do not report their length automatically, so
 * we compute it via form.getLength() before streaming. This avoids buffering the
 * whole file in memory while still giving the GPU service (Flask) the length it
 * requires to parse the multipart body.
 */
export function fetchWithForm(url: string, form: FormData): Promise<GpuResponse> {
  return new Promise<GpuResponse>((resolve, reject) => {
    form.getLength(async (err, length) => {
      if (err) {
        reject(new Error(`Could not compute form length: ${err.message}`));
        return;
      }
      try {
        resolve(
          await nodeFetch(url, {
            method: 'POST',
            body: form,
            headers: {
              ...form.getHeaders(),
              'Content-Length': String(length),
              ...GPU_TUNNEL_HEADERS,
            },
          }),
        );
      } catch (fetchErr) {
        reject(fetchErr);
      }
    });
  });
}
