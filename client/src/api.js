export class ApiError extends Error {
    constructor(message, status, payload) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.payload = payload;
    }
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, options);

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        // A non-JSON error body is still an error; fall back to status text.
    }

    if (!response.ok) {
        throw new ApiError(
            payload?.error || `${response.status} ${response.statusText}`,
            response.status,
            payload,
        );
    }

    return payload;
}

function query(params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            search.set(key, value);
        }
    }
    const serialized = search.toString();
    return serialized ? `?${serialized}` : '';
}

export function getHealth(signal) {
    return requestJson('/api/health', { signal });
}

export function listFiles(signal) {
    return requestJson('/api/files', { signal });
}

export function getFile(filename, encoding, signal) {
    return requestJson(`/api/file${query({ path: filename, encoding })}`, { signal });
}

export function getAnalysis(source, encoding, signal) {
    return requestJson(`/api/analysis${query({ source, encoding })}`, { signal });
}

export function computeAnalysis(source, encoding, force, signal) {
    return requestJson('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, encoding, force }),
        signal,
    });
}
