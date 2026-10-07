import { MediaRuntimeService } from './media-runtime.service';
describe('media runtime ephemeral credential handling', () => {
  const old = global.fetch;
  const media = new MediaRuntimeService('http://media.fixture');
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  afterEach(() => {
    global.fetch = old;
  });
  it('uses in-memory PATCH instead of credential-persisting PUT', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    await media.registerStream({
      name: 'fixture',
      rtspUrl: 'rtsp://fixture:private@localhost/source',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('name=fixture'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
  it('accepts config-write refusal only after explicit runtime absence proof', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValueOnce({ status: 404 });
    expect(await media.removeStream('fixture')).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  it('does not infer cleanup from ambiguous refusal or remaining source', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 400 })
      .mockResolvedValueOnce({ status: 200 });
    expect(await media.removeStream('fixture')).toBe(false);
  });
  it('does not infer cleanup after transport failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('unavailable'));
    expect(await media.removeStream('fixture')).toBe(false);
  });
});
