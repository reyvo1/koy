import { proxyBackend } from '@/lib/proxy';

/** PATCH /api/tenant/scenes/[sceneId] — enable/disable a scene. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> },
) {
  const { sceneId } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyBackend(
    (client) =>
      client.request(`/scenes/${sceneId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mengubah scene' },
  );
}

/** DELETE /api/tenant/scenes/[sceneId] — delete a scene. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sceneId: string }> },
) {
  const { sceneId } = await params;
  return proxyBackend(
    (client) => client.request(`/scenes/${sceneId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menghapus scene' },
  );
}
