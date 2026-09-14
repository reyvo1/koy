import { FormEvent, useState } from 'react';

interface AdminLoginFormProps {
  onAuthenticated: () => Promise<void>;
}

export function AdminLoginForm({ onAuthenticated }: AdminLoginFormProps) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/session/login', {
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password'),
        tenantId: form.get('tenantId'),
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).catch(() => null);

    try {
      if (!response?.ok) {
        setMessage(
          response?.status === 429
            ? 'Terlalu banyak percobaan. Coba kembali beberapa saat lagi.'
            : response?.status === 503
              ? 'Layanan autentikasi sedang tidak terhubung.'
              : 'Email, password, atau tenant tidak dapat diverifikasi.',
        );
        return;
      }

      await onAuthenticated();
    } finally {
      setPending(false);
    }
  }

  return (
    <form aria-busy={pending} className="iot-admin-login" onSubmit={submit}>
      <div>
        <p className="iot-eyebrow">Akses administrator</p>
        <h2>Masuk ke ringkasan operasional</h2>
        <p>
          Kredensial hanya dikirim ke route server Admin Web. Token tidak
          disimpan di local storage atau tersedia untuk JavaScript browser.
        </p>
      </div>
      <label>
        Tenant ID
        <input
          autoComplete="organization"
          name="tenantId"
          placeholder="ID tenant"
          required
          type="text"
        />
      </label>
      <label>
        Email
        <input autoComplete="username" name="email" required type="email" />
      </label>
      <label>
        Password
        <input
          autoComplete="current-password"
          name="password"
          required
          type="password"
        />
      </label>
      {message ? (
        <p className="iot-form-error" role="alert">
          {message}
        </p>
      ) : null}
      <button className="iot-button" disabled={pending} type="submit">
        {pending ? 'Memverifikasi…' : 'Masuk'}
      </button>
    </form>
  );
}
