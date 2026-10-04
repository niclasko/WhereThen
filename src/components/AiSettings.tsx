import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AiError, DEFAULT_OPENAI_MODEL, saveAiSettings, testAiSettings, useAiSettings, type AiSettings } from '../lib/ai';
import type { AiProgress } from '../lib/useAutoDescribe';

interface Props {
  progress: AiProgress;
  /** Photos that will be described once AI captions are on. */
  pending: number;
  onRetry: () => void;
}

/** A small ✨ button in the header that opens the optional "bring your own AI key" settings, from any page. */
export function AiButton({ progress, pending, onRetry }: Props) {
  const settings = useAiSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const title =
    progress.state === 'off'
      ? 'AI captions (off)'
      : progress.state === 'paused'
        ? `AI captions paused: ${progress.error}`
        : progress.state === 'working'
          ? 'AI captions: describing photos…'
          : 'AI captions: on';

  return (
    <div className="ai-menu" ref={ref}>
      <button
        className={`ai-button ${progress.state}`}
        aria-label={title}
        title={title}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ✨
      </button>
      {open && (
        <div className="ai-panel card" role="dialog" aria-label="AI captions">
          <h2>✨ AI captions</h2>
          {settings && (
            <p className={`small ${progress.state === 'paused' ? 'error-text' : 'muted'}`} role="status">
              {progress.state === 'paused' ? (
                <>
                  Paused: {progress.error}{' '}
                  <button className="link" onClick={onRetry}>
                    Retry
                  </button>
                </>
              ) : progress.state === 'working' ? (
                `On. Describing photos… ${pending} to go.`
              ) : (
                'On. All photos with a preview are described.'
              )}
            </p>
          )}
          <AiSettingsForm key={settings ? 'on' : 'off'} settings={settings} pending={pending} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function AiSettingsForm({ settings, pending, onDone }: { settings: AiSettings | null; pending: number; onDone: () => void }) {
  const [provider, setProvider] = useState<AiSettings['provider']>(settings?.provider ?? 'openai');
  const [endpoint, setEndpoint] = useState(settings?.provider === 'azure' ? settings.endpoint : '');
  const [apiKey, setApiKey] = useState(settings?.apiKey ?? '');
  const [model, setModel] = useState(settings?.model ?? DEFAULT_OPENAI_MODEL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: AiSettings =
      provider === 'azure'
        ? { provider, endpoint: endpoint.trim(), apiKey: apiKey.trim(), model: model.trim() }
        : { provider, apiKey: apiKey.trim(), model: model.trim() };
    setBusy(true);
    setError(undefined);
    try {
      await testAiSettings(next);
      await saveAiSettings(next);
      onDone();
    } catch (err) {
      setError(err instanceof AiError ? err.message : 'Couldn’t save the settings.');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    await saveAiSettings(null);
    onDone();
  };

  return (
    <form className="ai-form" onSubmit={submit}>
      {!settings && (
        <p className="muted small">
          Give every photo a short caption, tags and a category (🍽️ Food, 🏛️ Sights, 🏖️ Beach…) to search and filter by,
          using your own OpenAI or Azure AI key.
          {pending > 0 && ` ${pending} photo${pending === 1 ? '' : 's'} will be described.`}
        </p>
      )}
      <label>
        Service
        <select value={provider} onChange={(e) => setProvider(e.target.value as AiSettings['provider'])}>
          <option value="openai">OpenAI</option>
          <option value="azure">Azure OpenAI (Foundry)</option>
        </select>
      </label>
      {provider === 'azure' && (
        <label>
          Endpoint
          <input
            type="url"
            required
            placeholder="https://your-resource.openai.azure.com"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
          />
        </label>
      )}
      <label>
        API key
        <input type="password" required autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </label>
      <label>
        {provider === 'azure' ? 'Deployment name' : 'Model'}
        <input type="text" required value={model} onChange={(e) => setModel(e.target.value)} />
      </label>
      {error && (
        <p className="error-text small" role="alert">
          {error}
        </p>
      )}
      <div className="ai-form-actions">
        <button className="button primary small" type="submit" disabled={busy}>
          {busy ? 'Checking…' : settings ? 'Save' : 'Turn on'}
        </button>
        {settings && (
          <button className="button small" type="button" onClick={turnOff} disabled={busy}>
            Turn off
          </button>
        )}
        <button className="link" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
      <p className="muted small">
        Photo previews and place names are sent to your AI service; you pay it directly, typically a few cents per 100
        photos. The key stays in this browser and is never included in exported trips.
      </p>
    </form>
  );
}
