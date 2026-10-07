'use client';
import { useEffect, useRef, useState } from 'react';

/** Signaling stays on the authenticated product origin; no RTSP URL or camera secret reaches this component. */
export function CameraPlayer({ deviceId }: { deviceId: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const attempt = useRef(0);
  const connectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useRef<string | null>(null);
  const [state, setState] = useState('Siap');
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/camera-playback/${encodeURIComponent(deviceId)}`;
  function stop() {
    attempt.current++;
    if (connectionTimer.current) clearTimeout(connectionTimer.current);
    connectionTimer.current = null;
    setBusy(false);
    peer.current?.close();
    peer.current = null;
    if (video.current) video.current.srcObject = null;
    if (session.current) {
      void fetch(
        `${endpoint}?sessionId=${encodeURIComponent(session.current)}`,
        { method: 'DELETE', keepalive: true },
      );
      session.current = null;
    }
  }
  useEffect(() => () => stop(), [deviceId]);
  async function start() {
    stop();
    const generation = attempt.current;
    setBusy(true);
    setState('Menghubungkan…');
    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection();
      peer.current = pc;
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      const tracks = new MediaStream();
      pc.ontrack = (event) => {
        tracks.addTrack(event.track);
        if (video.current) video.current.srcObject = event.streams[0] ?? tracks;
      };
      pc.onconnectionstatechange = () => {
        if (peer.current === pc)
          setState(
            pc.connectionState === 'connected'
              ? 'Live'
              : pc.connectionState === 'failed'
                ? 'Koneksi gagal. Coba lagi.'
                : 'Menghubungkan…',
          );
      };
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise<void>((resolve, reject) => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
          return;
        }
        const timeout = setTimeout(() => {
          pc.removeEventListener('icegatheringstatechange', ready);
          reject(new Error('Koneksi video melewati batas waktu.'));
        }, 8000);
        function ready() {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            pc.removeEventListener('icegatheringstatechange', ready);
            resolve();
          }
        }
        pc.addEventListener('icegatheringstatechange', ready);
      });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sdp: pc.localDescription?.sdp }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.message ?? body.error?.message ?? 'Live view belum tersedia.',
        );
      if (peer.current !== pc) {
        await fetch(
          `${endpoint}?sessionId=${encodeURIComponent(body.sessionId)}`,
          { method: 'DELETE' },
        );
        return;
      }
      session.current = body.sessionId;
      await pc.setRemoteDescription({ type: 'answer', sdp: body.sdp });
      connectionTimer.current = setTimeout(() => {
        if (attempt.current === generation) {
          stop();
          setState('Sesi live view berakhir. Sambungkan kembali.');
        }
      }, 900000);
    } catch (error) {
      if (attempt.current === generation) {
        stop();
        setState(error instanceof Error ? error.message : 'Live view gagal.');
      }
    } finally {
      if (attempt.current === generation) setBusy(false);
    }
  }
  return (
    <section
      className="iot-camera-player"
      style={{
        borderRadius: 12,
        border: '1px solid #334155',
        padding: 16,
        background: '#131722',
        color: '#e6e9f0',
      }}
    >
      <video
        ref={video}
        autoPlay
        playsInline
        muted
        controls
        onPlaying={() => setState('Live')}
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          background: '#0b0e14',
          borderRadius: 8,
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 12,
        }}
      >
        <button
          className="iot-button"
          type="button"
          disabled={busy}
          onClick={() => void start()}
        >
          {busy ? 'Menghubungkan…' : 'Lihat live'}
        </button>
        <button
          className="iot-button"
          type="button"
          onClick={() => {
            stop();
            setState('Dihentikan');
          }}
        >
          Hentikan
        </button>
        <span role="status" style={{ fontSize: 13 }}>
          {state}
        </span>
      </div>
    </section>
  );
}
