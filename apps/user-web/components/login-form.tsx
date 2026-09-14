import { FormEvent, useState } from 'react';

interface LoginFormProps {
  onAuthenticated: () => Promise<void>;
}

export function LoginForm({ onAuthenticated }: LoginFormProps) {
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

    if (!response?.ok) {
      setMessage(
        response?.status === 429
          ? 'Terlalu banyak percobaan. Coba kembali beberapa saat lagi.'
          : 'Email, password, atau tenant tidak dapat diverifikasi.',
      );
      setPending(false);
      return;
    }

    await onAuthenticated();
    setPending(false);
  }

  return (
    <form className="iot-login" onSubmit={submit}>
      <div>
        <p className="iot-eyebrow">Akses tenant</p>
        <h2>Masuk ke dashboard</h2>
        <p>
          Kredensial dikirim hanya ke route server User Web dan tidak disimpan
          di local storage browser.
        </p>
      </div>
      <label>
        Tenant ID
        <input
          autoComplete="organization"
          name="tenantId"
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
